import { useT } from "../../shared/i18n";
import { Menu, useToast, type MenuItem } from "../../shared/ui";
import { usePrefs } from "../access";
import { isWeather, pieceOnStage, useSession } from "../presets";
import { loadClassMap } from "../stage";
import { SAVE_MENU_ID } from "./save-id";
import { toCsv, toScoreJson, toTactileSvg, toTranscript, toVtt } from "./model/exports";
import { archiveLinks, archiveStem, liveStem, liveWavLink } from "./model/links";
import type { Soundscape, WeatherSoundscape } from "../../shared/api";

function downloadText(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function SaveMenu() {
  const { t, lang } = useT();
  const { show } = useToast();
  const source = useSession((s) => s.source);
  const sounding = useSession((s) => s.soundscape);
  const muted = useSession((s) => s.muted);
  const stereo = usePrefs((p) => p.stereo);

  const onStage = pieceOnStage(sounding, source);

  function liveItems(s: WeatherSoundscape): MenuItem[] {
    const stem = liveStem(s);

    return [
      {
        id: "wav",
        icon: "download",
        label: t(stereo ? "w.dl.wav" : "save.wavMono"),
        href: liveWavLink(s, muted, stereo),
        download: `${stem}.wav`,
      },
      {
        id: "json",
        icon: "download",
        label: t("w.dl.score"),
        onSelect: () =>
          downloadText(
            toScoreJson(s),
            `earth-jukebox-score-${s.section.key}.json`,
            "application/json",
          ),
      },
    ];
  }

  function archiveItems(s: Soundscape): MenuItem[] {
    const stem = archiveStem(s);
    const links = archiveLinks(s, muted);
    const title = s.frame?.title ?? t("app.title");

    return [
      { id: "wav", icon: "download", label: t("dl.wav"), href: links.wav, download: `${stem}.wav` },
      {
        id: "midi",
        icon: "download",
        label: t("dl.midi"),
        href: links.midi,
        download: `${stem}.mid`,
      },
      {
        id: "vtt",
        icon: "captions",
        label: t("dl.vtt"),
        onSelect: () => downloadText(toVtt(s), `${stem}.${lang}.vtt`, "text/vtt"),
      },
      {
        id: "txt",
        icon: "download",
        label: t("dl.txt"),
        onSelect: () =>
          downloadText(toTranscript(s, title), `${stem}.${lang}.txt`, "text/plain;charset=utf-8"),
      },
      {
        id: "csv",
        icon: "download",
        label: t("dl.csv"),
        onSelect: () => downloadText(toCsv(s), `${stem}.csv`, "text/csv"),
      },
      {
        id: "svg",
        icon: "printer",
        label: t("dl.svg"),
        onSelect: () => {
          loadClassMap(s).then(
            (map) =>
              downloadText(toTactileSvg(s, map, title), `${stem}-tactile.svg`, "image/svg+xml"),
            () => show(t("save.error"), { kind: "alert" }),
          );
        },
      },
    ];
  }

  function itemsFor(s: Soundscape | WeatherSoundscape | undefined): MenuItem[] {
    if (!s) return [];
    return isWeather(s) ? liveItems(s) : archiveItems(s);
  }

  return (
    <Menu
      id={SAVE_MENU_ID}
      label={t("save.open")}
      icon="download"
      items={itemsFor(onStage)}
      disabledReason={onStage ? undefined : t("save.none")}
    />
  );
}
