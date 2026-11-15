// A pick runs compose -> stems -> player.load -> mix and repeat -> play. A newer pick aborts the older one,
// so only the last of several quick clicks sounds. A live mix set to repeat all layers (Sound settings)
// hands the player to the layer tour.

import { isCancelledError, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { create } from "zustand";
import { canStartAudio } from "../../audio/activation";
import { getPlayer } from "../../audio/player-instance";
import type { Repeat, StemPlayer } from "../../audio/stem-player";
import { ApiError, type SectionKey, type WeatherSoundscape } from "../../shared/api";
import { t } from "../../shared/i18n";
import { isAbortError } from "../../shared/lib/abort";
import type { ToastOptions } from "../../shared/ui";
import { setPref, usePrefs } from "../access/prefs.store";
import { createTour, type Tour } from "../live/model/tour";
import { composeLive, composePreset, rulesFirst } from "./compose";
import { DEFAULT_PRESET, firstPreset, presetById, type Preset, type PresetId } from "./presets";
import {
  findPreset,
  isWeather,
  mixFor,
  pieceOnStage,
  stemKeys,
  useSession,
  type SessionPresetId,
  type Source,
} from "./session.store";
import type { SleeveProgress } from "./Sleeve";
import { stemsCache } from "./stems-cache";

export type Progress = SleeveProgress;

type LivePreset = Extract<Preset, { source: "live" }>;

// How long the AudioContext may stay suspended after Play before the iPhone silent-switch hint.
const IOS_HINT_MS = 500;
// With repeat "off" the player stops this long after the scan ends: the stems carry a reverb tail.
export const END_GRACE_SEC = 3;

export interface PresetDeps {
  queryClient: QueryClient;
  toast(msg: string, opts?: ToastOptions): number | void; // an id when the toast can be taken back
  dismiss?(id: number): void;
}

interface PickRun {
  ctrl: AbortController;
  keys: QueryKey[]; // compose queries to cancel when a newer pick comes
  id: SessionPresetId;
  pending: boolean;
  play: boolean; // made to start sound (a click), not just to prepare
  active: boolean; // unlike `pending`, also covers starting the playback
}

export interface TourReadiness {
  ready: number;
  total: number;
  id: SessionPresetId;
}

interface Status {
  progress: Partial<Record<SessionPresetId, Progress>>;
  error?: string;
  errorId?: SessionPresetId;
  tour?: TourReadiness;
}

export const usePresetStatus = create<Status>()(() => ({ progress: {} }));

let current: PickRun | null = null;
let tour: Tour | null = null;
let tourRun: { deps: PresetDeps; run: PickRun; preset: LivePreset; freshMix: boolean } | null =
  null;
let repeat: Repeat = "off";
let endTimer = 0;
let iosHintShown = false;
let wiredTo: StemPlayer | null = null;
let unwire: (() => void) | null = null;
// A single live piece composed from a newer reading, waiting in the player's next deck for the boundary.
let liveNext: { run: PickRun; s: WeatherSoundscape } | null = null;
let refreshToken = 0;
// Toasts that belong to one pick ("Try again", the AI offer): a newer pick takes them away.
let pickToasts: number[] = [];
const playStartListeners = new Set<(id: SessionPresetId, durationSec: number) => void>();

function isAbort(err: unknown): boolean {
  return isAbortError(err) || isCancelledError(err);
}

function errorText(err: unknown): string {
  if (err instanceof TypeError) return t("preset.error.offline"); // fetch could not reach the server
  if (!(err instanceof ApiError)) return t("preset.error.failed");

  if (err.status === 429) return t("preset.error.busy");
  if (err.status === 502 || err.status === 503 || err.status === 504) {
    return t("preset.error.offline");
  }
  return t("preset.error.failed");
}

function presetOf(id: SessionPresetId): Preset | undefined {
  return findPreset(id, useSession.getState().custom);
}

function repeatFor(preset: Preset, prefsRepeat: Repeat): Repeat {
  if (preset.source === "live") return preset.repeat;
  return prefsRepeat === "off" ? "off" : "one";
}

function isTour(p: Preset): p is LivePreset {
  return p.source === "live" && p.repeat === "all";
}

function setProgress(run: PickRun, p: Progress): void {
  if (current !== run || !run.pending) return;
  usePresetStatus.setState((s) => ({ progress: { ...s.progress, [run.id]: p } }));
}

function downloadProgress(run: PickRun): (fraction: number) => void {
  return (f) => setProgress(run, { phase: "download", pct: Math.round(f * 100) });
}

function pickToast(deps: PresetDeps, msg: string, opts: ToastOptions): void {
  const id = deps.toast(msg, opts);
  if (typeof id === "number") pickToasts.push(id);
}

function dropPickToasts(deps: PresetDeps): void {
  for (const id of pickToasts) deps.dismiss?.(id);
  pickToasts = [];
}

// Repeat "off" stops at the end of the reverb tail from a timer, so it does not depend on rAF.
function armEnd(): void {
  const player = getPlayer();
  window.clearTimeout(endTimer);
  endTimer = 0;
  if (!player.playing || repeat !== "off" || player.duration <= 0) return;

  const left = player.duration + END_GRACE_SEC - player.position;
  const onEnd = () => {
    endTimer = 0;
    if (!player.playing || repeat !== "off") return;

    if (player.position >= player.duration + END_GRACE_SEC - 0.05) player.stop();
    else armEnd();
  };

  endTimer = window.setTimeout(onEnd, Math.max(0, left * 1000));
}

function enforceMono(player: StemPlayer): void {
  if (!usePrefs.getState().stereo) player.setPan(0);
}

// Once per player: the end timer follows pause, seek and stop, and mono follows prefs.stereo.
function wire(player: StemPlayer): void {
  if (wiredTo === player) return;

  unwire?.();
  wiredTo = player;

  const offPlayer = player.subscribe(armEnd);
  const offPrefs = usePrefs.subscribe((p, prev) => {
    if (p.stereo !== prev.stereo) enforceMono(player);
  });

  unwire = () => {
    offPlayer();
    offPrefs();
  };
}

function applyRepeat(player: StemPlayer, mode: Repeat): void {
  repeat = mode;
  player.setRepeat(mode);
  armEnd();
}

// A repeat change while an archive piece is loaded reaches the player; live presets keep their own.
export function applyRepeatPref(): void {
  const s = useSession.getState().soundscape;
  const player = getPlayer();
  if (!s || isWeather(s) || !player.ready) return;

  applyRepeat(player, usePrefs.getState().repeat === "off" ? "off" : "one");
}

async function startPlayback(deps: PresetDeps, player: StemPlayer): Promise<void> {
  const hint = window.setTimeout(() => {
    if (iosHintShown || player.input().ctx.state !== "suspended") return;

    iosHintShown = true;
    deps.toast(t("audio.iosMute"));
  }, IOS_HINT_MS);

  try {
    await player.play();
  } catch (err) {
    window.clearTimeout(hint);
    throw err;
  }

  armEnd();
}

function getTour(player: StemPlayer): Tour {
  tour ??= createTour(
    player,
    (key, signal) => {
      const r = tourRun!;
      const settings = { ...r.preset.settings, section: key };
      return composeLive(r.deps.queryClient, settings, signal, r.run.keys);
    },
    (s, signal) => {
      const r = tourRun!;
      const first = r.run.pending && s.section.key === r.preset.settings.section;
      return stemsCache.get(s, signal, first ? downloadProgress(r.run) : undefined);
    },
    {
      onShow(s) {
        const r = tourRun!;
        useSession.getState().show(s, r.freshMix ? mixFor(r.preset, stemKeys(s)) : undefined);
        r.freshMix = false;
        enforceMono(player);
      },
      onReadiness(ready, total) {
        usePresetStatus.setState({ tour: { ready, total, id: tourRun!.run.id } });
      },
    },
  );

  return tour;
}

function stopTour(): void {
  tour?.stop();
  usePresetStatus.setState({ tour: undefined });
}

function dropLiveNext(): void {
  refreshToken++;
  liveNext = null;
}

function onLiveAdvance(): void {
  const next = liveNext;
  liveNext = null;
  if (!next || current !== next.run) return;

  useSession.getState().show(next.s);
  enforceMono(getPlayer());
}

// A loaded live piece takes a new reading at its next cycle boundary, never mid-cycle. The tour regenerates
// through its own queue; a single piece is composed again and queued only when the composition changed.
// Errors stay quiet: the old piece keeps playing. True when something was queued.
async function refreshLive(deps: PresetDeps): Promise<boolean> {
  const run = current;
  const player = getPlayer();
  if (!run || run.pending || run.ctrl.signal.aborted || !player.ready) return false;

  // Decide from what the player holds, not from the last pick: a pick that only warmed (no sound) leaves
  // the player on an older piece, and a fresh deck for the pick would land behind that piece.
  if (player.getSnapshot().tag !== run.id) return false;

  const preset = presetOf(run.id);
  if (!preset || preset.source !== "live") return false;

  if (tour?.active && tourRun?.run === run) {
    tour.refresh();
    return true;
  }

  // Only a looping single piece takes a fresh deck: with repeat "off" it would be appended after the end,
  // and a tour preset without its tour has no queue of its own.
  if (preset.repeat !== "one") return false;

  const sounding = useSession.getState().soundscape;
  if (!sounding || !isWeather(sounding)) return false;

  const token = ++refreshToken;
  const { signal } = run.ctrl;
  const stale = () =>
    token !== refreshToken ||
    current !== run ||
    signal.aborted ||
    player.getSnapshot().tag !== run.id;

  try {
    const composer = sounding.composer?.requested ?? preset.settings.composer;
    const settings = { ...preset.settings, composer };
    const s = await composeLive(deps.queryClient, settings, signal, run.keys);
    if (stale() || s.id === sounding.id) return false;

    const stems = await stemsCache.get(s, signal);
    if (stale()) return false;

    const placed = await player.setNext(stems, s.durationSec, run.id);
    // Armed only once the fresh deck is in place: while it decodes, a boundary loops the old piece (repeat
    // "one" fires onAdvance at every loop) and must not show the new one. A load in between drops the deck.
    if (!placed || stale()) return false;

    liveNext = { run, s };
    player.onAdvance = onLiveAdvance;
    return true;
  } catch {
    return false;
  }
}

export function refreshLiveForNewReading(queryClient: QueryClient): Promise<boolean> {
  return refreshLive({ queryClient, toast: () => undefined });
}

async function loadSingle(deps: PresetDeps, preset: Preset, run: PickRun): Promise<boolean> {
  const player = getPlayer();
  const { signal } = run.ctrl;

  const s = await composePreset(deps.queryClient, preset, signal, run.keys);
  setProgress(run, { phase: "download", pct: 0 });

  const stems = await stemsCache.get(s, signal, downloadProgress(run));
  if (signal.aborted) return false;

  stopTour();
  const loaded = await player.load(stems, s.durationSec, run.id, {
    restart: true,
    stale: () => signal.aborted,
  });
  if (!loaded) return false;

  useSession.getState().show(s, mixFor(preset, stemKeys(s)));
  applyRepeat(player, repeatFor(preset, usePrefs.getState().repeat));
  enforceMono(player);
  return true;
}

// A Tune change while the tour plays keeps the layer that sounds now; a changed layer tile, or a tour
// from another preset, starts where it says.
function tourFirstLayer(preset: LivePreset, id: SessionPresetId): SectionKey {
  const sounding = tour?.active ? tour.current : null;
  const sameLayer = tourRun && preset.settings.section === tourRun.preset.settings.section;

  if (id === "custom" && sounding && sameLayer) return sounding.section.key;
  return preset.settings.section;
}

async function loadTour(deps: PresetDeps, preset: LivePreset, run: PickRun): Promise<boolean> {
  const first = tourFirstLayer(preset, run.id);
  tourRun = { deps, run, preset, freshMix: true };

  const ok = await getTour(getPlayer()).start({
    first,
    tag: run.id,
    restart: true,
    stale: () => run.ctrl.signal.aborted,
  });

  if (ok) {
    repeat = "all"; // the tour set the player's repeat itself, right before its first load
    armEnd();
  }
  return ok;
}

// A deep link selects without sound: warm the caches so the first Play is quick, without an AudioContext.
async function warm(deps: PresetDeps, preset: Preset, run: PickRun): Promise<void> {
  const { signal } = run.ctrl;

  const s = await composePreset(deps.queryClient, preset, signal, run.keys);
  if (!getPlayer().ready) useSession.getState().show(s, mixFor(preset, stemKeys(s)));
  else useSession.getState().remember(s);

  setProgress(run, { phase: "download", pct: 0 });
  await stemsCache.get(s, signal, downloadProgress(run));
}

// "AI composes": the rules version plays; when the AI score is ready, a quiet toast offers it.
async function offerAi(deps: PresetDeps, preset: Preset, run: PickRun): Promise<void> {
  const { signal } = run.ctrl;

  let s: WeatherSoundscape;
  try {
    s = (await composePreset(
      deps.queryClient,
      preset,
      signal,
      run.keys,
      "ai",
    )) as WeatherSoundscape;
  } catch {
    return; // the rules version keeps playing
  }
  if (current !== run || signal.aborted || !s.composer.used.startsWith("ai:")) return;

  const adopt = async () => {
    if (current !== run || signal.aborted) return;

    dropLiveNext();
    try {
      const stems = await stemsCache.get(s, signal);
      const loaded = await getPlayer().load(stems, s.durationSec, run.id, {
        restart: false,
        stale: () => signal.aborted,
      });
      if (loaded) useSession.getState().show(s);
    } catch (err) {
      if (!isAbort(err)) deps.toast(errorText(err), { kind: "alert" });
    }
  };

  pickToast(deps, t("preset.aiReady"), {
    action: { label: t("preset.aiUse"), run: () => void adopt() },
  });
}

function startRun(deps: PresetDeps, id: SessionPresetId, play: boolean): PickRun {
  if (current) {
    current.ctrl.abort();
    for (const key of current.keys) {
      void deps.queryClient.cancelQueries({ queryKey: key, exact: true });
    }
  }

  const run: PickRun = {
    ctrl: new AbortController(),
    keys: [],
    id,
    pending: true,
    play,
    active: true,
  };
  current = run;
  dropLiveNext();
  dropPickToasts(deps);
  return run;
}

// `load` (without `play`) puts the piece on the player in silence, for Play and the map's hover voices. It
// needs an AudioContext, so only after a gesture; a tour preset is only warmed.
export async function pickPreset(
  deps: PresetDeps,
  id: SessionPresetId,
  play: boolean,
  load = false,
): Promise<void> {
  const preset = presetOf(id);
  if (!preset) return;

  const player = getPlayer();
  wire(player);

  // Still inside the click: resume the AudioContext while the browser counts it as a gesture (iOS).
  if (play) {
    player
      .input()
      .ctx.resume()
      .catch(() => undefined);
  }

  const run = startRun(deps, id, play);
  const { signal } = run.ctrl;

  useSession.getState().pick(id);
  // Prepared without sound: the player will not hold it until Play.
  if (!play) useSession.getState().setStaged(true);
  usePresetStatus.setState({
    progress: { [id]: { phase: "compose" } },
    error: undefined,
    errorId: undefined,
  });

  try {
    if (!play && (!load || isTour(preset))) {
      await warm(deps, preset, run);
      return;
    }
    if (!play) {
      if (!(await loadSingle(deps, preset, run)) || signal.aborted) return;

      useSession.getState().setStaged(false);
      return;
    }

    const loaded = isTour(preset)
      ? await loadTour(deps, preset, run)
      : await loadSingle(deps, preset, run);
    if (!loaded || signal.aborted) return;

    run.pending = false;
    useSession.getState().setStaged(false);
    usePresetStatus.setState({ progress: {} });
    // Paused or stopped while it loaded: the piece is on stage, but silent.
    if (!run.play) return;
    await startPlayback(deps, player);
    if (!run.play) {
      player.pause();
      return;
    }

    if (current === run && !signal.aborted) {
      for (const cb of [...playStartListeners]) cb(id, player.duration);
    }
    if (id !== "custom") setPref("lastPreset", id);
    if (rulesFirst(preset)) void offerAi(deps, preset, run);
  } catch (err) {
    if (signal.aborted || isAbort(err)) return;

    const message = errorText(err);
    // The wave drawn in Tune is not sounding and will not be: back to the shape that is.
    if (id === "custom") useSession.getState().setPreview(null);

    run.pending = false;
    usePresetStatus.setState({ progress: {}, error: message, errorId: id });
    pickToast(deps, message, {
      kind: "alert",
      action: { label: t("preset.error.retry"), run: () => void pickPreset(deps, id, true) },
    });
  } finally {
    run.pending = false;
    run.active = false;
    if (current === run && usePresetStatus.getState().progress[id]) {
      usePresetStatus.setState({ progress: {} });
    }
  }
}

// Pause or Stop pressed while a pick still loads: it may finish loading, but must not start sound.
export function cancelPendingPlay(): void {
  if (current?.active) current.play = false;
}

export function isPlayPending(id?: SessionPresetId): boolean {
  if (!current || !current.play || !current.active) return false;
  return id === undefined || current.id === id;
}

export function subscribePlayStart(
  cb: (id: SessionPresetId, durationSec: number) => void,
): () => void {
  playStartListeners.add(cb);
  return () => {
    playStartListeners.delete(cb);
  };
}

// The record the shown row plays: the selection when it is of this row, else the row's first record.
function rowTarget(): SessionPresetId {
  const { presetId, source, custom } = useSession.getState();
  return findPreset(presetId, custom)?.source === source ? presetId : firstPreset(source).id;
}

function onPlayer(id: SessionPresetId): boolean {
  const player = getPlayer();
  const { soundscape, source, staged } = useSession.getState();

  return (
    player.ready &&
    !staged &&
    player.getSnapshot().tag === id &&
    pieceOnStage(soundscape, source) !== undefined
  );
}

let staging: { id: SessionPresetId; promise: Promise<boolean> } | null = null;

// Puts the shown row's record on the player without sound, once the page may make sound. Many hovers
// share one load. True when the player holds it.
export function stageSelection(deps: PresetDeps): Promise<boolean> {
  const id = rowTarget();
  if (onPlayer(id)) return Promise.resolve(true);
  if (!canStartAudio() || isPlayPending() || getPlayer().playing) return Promise.resolve(false);
  if (staging?.id === id) return staging.promise;

  const promise = pickPreset(deps, id, false, true).then(
    () => onPlayer(id),
    () => false,
  );
  staging = { id, promise };
  void promise.finally(() => {
    if (staging?.promise === promise) staging = null;
  });
  return promise;
}

// The switch between the archive and live: the other source's music stops, the row comes back to its own
// record, and that record waits on the player, so Play and the map answer at once.
export function switchSource(deps: PresetDeps, source: Source): void {
  const session = useSession.getState();
  if (session.source === source) return;

  const player = getPlayer();
  cancelPendingPlay();
  if (player.playing) player.pause();
  session.setSource(source);
  void stageSelection(deps);
}

// Compose JSON only: stems are never prefetched in bulk.
export function prefetchCompose(deps: PresetDeps, id: PresetId): void {
  const preset = presetById(id);
  if (preset) composePreset(deps.queryClient, preset).catch(() => undefined);
}

export async function prefetchDefault(deps: PresetDeps): Promise<void> {
  const preset = presetById(useSession.getState().presetId) ?? presetById(DEFAULT_PRESET)!;

  try {
    const s = await composePreset(deps.queryClient, preset);
    // The map of a fresh page can be explored before anything plays.
    const { soundscape, presetId } = useSession.getState();
    if (!soundscape && !getPlayer().ready && presetId === preset.id) {
      useSession.getState().show(s, mixFor(preset, stemKeys(s)));
    }
    await stemsCache.get(s);
  } catch {
    // A click will try again and show the error then.
  }
}

export function resetPresetEngine(): void {
  current?.ctrl.abort();
  current = null;
  staging = null;
  tour?.stop();
  tour = null;
  tourRun = null;
  repeat = "off";
  window.clearTimeout(endTimer);
  endTimer = 0;
  iosHintShown = false;
  dropLiveNext();
  unwire?.();
  unwire = null;
  wiredTo = null;
  stemsCache.clear();
  pickToasts = [];
  usePresetStatus.setState(
    { progress: {}, error: undefined, errorId: undefined, tour: undefined },
    true,
  );
}
