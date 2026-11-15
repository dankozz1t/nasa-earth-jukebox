import { useRef, useState, type ChangeEvent } from "react";
import { useFrames, type Mode } from "../../shared/api";
import { useT } from "../../shared/i18n";
import { Button, Icon, Segmented, Slider, Switch } from "../../shared/ui";
import { setPref, usePrefs } from "../access";
import { BED, useSession, type Preset } from "../presets";
import { archiveFrame } from "../stage";
import { ModeDiagram, SensitivityDiagram } from "./diagrams";
import { InstrumentsPanel } from "./InstrumentsPanel";
import { LengthSetting } from "./LengthSetting";
import { MorePanel } from "./MorePanel";
import { SettingsTabs, type TabId } from "./SettingsTabs";
import { Tiles } from "./Tiles";
import styles from "./tune.module.css";
import { TipHeading } from "./TipHeading";
import { useDraft } from "./useDraft";

type Nasa = Extract<Preset, { source: "nasa" }>;
type Loop = "off" | "all";

const MODES: Mode[] = ["raw", "scale", "harmony"];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface NasaTuneProps {
  base: Nasa;
  schedule(next: Preset): void;
  amend(next: Preset): void;
  tab: TabId;
  onTab(id: TabId): void;
}

export function NasaTune({ base, schedule, amend, tab, onTab }: NasaTuneProps) {
  const { t } = useT();
  const loop: Loop = usePrefs((p) => p.repeat) === "off" ? "off" : "all";
  const nasaFrame = archiveFrame(useFrames().data);

  const { draft, latest, show, commit, withSettings } = useDraft(base, schedule);
  const [otherLength, setOtherLength] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const { mode, durationSec, sensitivity } = draft.settings;

  // The drone is a mix switch, not a new composition: the piece that sounds keeps going.
  function setBed(on: boolean) {
    const next: Nasa = { ...latest.current, bed: on };
    show(next);

    const session = useSession.getState();
    session.setCustom(next);

    const hasBed = session.soundscape && BED in session.soundscape.artifacts.stems;
    if (hasBed && !!session.muted[BED] === on) session.toggleMute(BED);

    amend(next); // a composition change that is waiting carries the new drone too
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;

    if (!IMAGE_TYPES.includes(file.type)) {
      setUploadError(t("tune.upload.type"));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(t("upload.tooBig"));
      return;
    }

    setUploadError(undefined);
    commit({ ...latest.current, file });
  }

  function resetFrame() {
    setUploadError(undefined);
    commit({ ...latest.current, file: undefined });
  }

  const sound = (
    <div className={styles.stack}>
      <section className={styles.group}>
        <TipHeading title={t("mode.legend")} tip={t("set.tip.mode")} />
        <Tiles<Mode>
          label={t("mode.group")}
          value={mode}
          onChange={(v) => commit(withSettings({ mode: v }))}
          options={MODES.map((m) => ({
            value: m,
            label: t(`mode.${m}`),
            desc: t(`tune.mode.${m}`),
            diagram: <ModeDiagram mode={m} />,
          }))}
        />
        <p className={styles.note}>{t(`mode.hint.${mode}`)}</p>
      </section>

      <section className={styles.group}>
        <h3 className={styles.heading}>{t("scan.length")}</h3>
        <LengthSetting
          label={t("scan.length")}
          durationSec={durationSec}
          other={otherLength}
          onOther={setOtherLength}
          onShow={(v) => show(withSettings({ durationSec: v }))}
          onCommit={(v) => commit(withSettings({ durationSec: v }))}
        />
      </section>

      <section className={styles.group}>
        <TipHeading title={t("tune.sens")} tip={t("set.tip.sens")} />
        <SensitivityDiagram level={sensitivity} />
        <Slider
          label={t("tune.sens")}
          value={sensitivity}
          min={0}
          max={4}
          step={1}
          valueText={(v) => t(`set.sens.${v}`)}
          onChange={(v) => show(withSettings({ sensitivity: v }))}
          onCommit={(v) => commit(withSettings({ sensitivity: v }))}
        />
        <p className={styles.note}>{t("set.sens.hint")}</p>
      </section>

      <section className={styles.group}>
        <TipHeading title={t("set.drone.title")} tip={t("set.tip.drone")} />
        <Switch
          icon="audio-lines"
          label={t("tune.drone")}
          description={t("tune.drone.hint")}
          checked={draft.bed}
          onChange={setBed}
        />
      </section>

      <section className={styles.group}>
        <h3 className={styles.heading}>{t("w.repeat")}</h3>
        {/* A player setting, not a composition: it applies to the piece at once and never starts sound. */}
        <Segmented<Loop>
          label={t("w.repeat")}
          value={loop}
          onChange={(v) => setPref("repeat", v)}
          options={[
            { value: "off", label: t("tune.repeat.off"), icon: "arrow-right-to-line" },
            { value: "all", label: t("set.loop"), icon: "repeat" },
          ]}
        />
      </section>
    </div>
  );

  const frame = (
    <div className={styles.stack}>
      <section className={styles.group} aria-labelledby="tune-frame">
        <h3 id="tune-frame" className={styles.heading}>
          {t("upload.legend")}
        </h3>
        {!draft.file && nasaFrame && (
          <p className={styles.note}>
            <Icon name="image" size={16} /> {t("set.frame.nasa", { title: nasaFrame.title })}
          </p>
        )}
        <p className={styles.note}>
          <Icon name="info" size={16} /> {t("tune.upload.note")}
        </p>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
        />
        <div className={styles.actions}>
          <Button variant="outline" icon="upload" onClick={() => input.current?.click()}>
            {t("tune.upload.choose")}
          </Button>
          {draft.file && (
            <Button variant="ghost" icon="rotate-ccw" onClick={resetFrame}>
              {t("upload.reset")}
            </Button>
          )}
        </div>
        {draft.file && (
          <p className={styles.note}>{t("tune.upload.using", { name: draft.file.name })}</p>
        )}
        {uploadError && (
          <p className={styles.error} role="alert">
            {uploadError}
          </p>
        )}
      </section>
    </div>
  );

  return (
    <SettingsTabs
      value={tab}
      onChange={onTab}
      tabs={[
        { id: "sound", icon: "audio-lines", panel: sound },
        { id: "instruments", icon: "layers", panel: <InstrumentsPanel /> },
        { id: "frame", icon: "image", panel: frame },
        { id: "more", icon: "info", panel: <MorePanel base={base} /> },
      ]}
    />
  );
}
