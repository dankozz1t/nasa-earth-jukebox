import { useState } from "react";
import { useComposerStatus } from "../../shared/api";
import type { ComposerMode, SectionKey } from "../../shared/api";
import { useT } from "../../shared/i18n";
import type { Repeat } from "../../audio/stem-player";
import { Icon, Segmented, Slider, Switch } from "../../shared/ui";
import { setPref, usePrefs } from "../access";
import { useSession, type Preset } from "../presets";
import { StereoDiagram } from "./diagrams";
import { TipHeading } from "./TipHeading";
import { InstrumentsPanel } from "./InstrumentsPanel";
import { LengthSetting } from "./LengthSetting";
import { MorePanel } from "./MorePanel";
import { SettingsTabs, type TabId } from "./SettingsTabs";
import { Tiles } from "./Tiles";
import styles from "./tune.module.css";
import { useDraft } from "./useDraft";
import { WavePreview } from "./WavePreview";

type Live = Extract<Preset, { source: "live" }>;

const LAYERS = [
  { value: "temperature", icon: "thermometer" },
  { value: "precipitation", icon: "droplets" },
  { value: "clouds", icon: "cloud" },
  { value: "wind", icon: "wind" },
] as const satisfies readonly { value: SectionKey; icon: string }[];

const COMPOSER_ICON = {
  auto: "gauge",
  algorithmic: "list-checks",
  ai: "sparkles",
  aerosol: "layers",
} as const;

interface LiveTuneProps {
  base: Live;
  schedule(next: Preset): void;
  tab: TabId;
  onTab(id: TabId): void;
}

export function LiveTune({ base, schedule, tab, onTab }: LiveTuneProps) {
  const { t } = useT();
  const aiAvailable = useComposerStatus().data?.aiAvailable;
  const stereo = usePrefs((p) => p.stereo);
  const setPreview = useSession((s) => s.setPreview);

  const { draft, latest, show, commit, withSettings } = useDraft(base, schedule);
  const [otherLength, setOtherLength] = useState(false);
  const { cycles, amplitude, durationSec, section, composer } = draft.settings;

  const shape = (c: number, a: number) => setPreview({ cycles: c, amplitude: a });

  const sound = (
    <div className={styles.stack}>
      <section className={styles.group}>
        <TipHeading title={t("tune.layer")} tip={t("set.tip.layer")} />
        <Tiles
          label={t("tune.layer")}
          value={section}
          onChange={(v) => commit(withSettings({ section: v }))}
          options={LAYERS.map((l) => ({
            value: l.value,
            icon: l.icon,
            label: t(`w.sec.${l.value}`),
          }))}
        />
      </section>

      <section className={styles.group}>
        <TipHeading title={t("w.wave")} tip={t("set.tip.wave")} />
        <WavePreview cycles={cycles} amplitude={amplitude} />
        <Slider
          label={t("tune.density")}
          value={cycles}
          min={0.5}
          max={12}
          step={0.5}
          valueText={(v) => t("w.cycles", { n: v })}
          onChange={(v) => {
            show(withSettings({ cycles: v }));
            shape(v, latest.current.settings.amplitude);
          }}
          onCommit={(v) => commit(withSettings({ cycles: v }))}
        />
        <Slider
          label={t("tune.width")}
          value={Math.round(amplitude * 100)}
          min={10}
          max={100}
          step={5}
          valueText={(v) => `${v}%`}
          onChange={(v) => {
            show(withSettings({ amplitude: v / 100 }));
            shape(latest.current.settings.cycles, v / 100);
          }}
          onCommit={(v) => commit(withSettings({ amplitude: v / 100 }))}
        />
      </section>

      <section className={styles.group}>
        <h3 className={styles.heading}>{t("w.length")}</h3>
        <LengthSetting
          label={t("w.length")}
          durationSec={durationSec}
          other={otherLength}
          onOther={setOtherLength}
          onShow={(v) => show(withSettings({ durationSec: v }))}
          onCommit={(v) => commit(withSettings({ durationSec: v }))}
        />
      </section>

      <section className={styles.group}>
        <h3 className={styles.heading}>{t("w.repeat")}</h3>
        <Segmented<Repeat>
          label={t("w.repeat")}
          value={draft.repeat}
          onChange={(v) => commit({ ...latest.current, repeat: v })}
          options={[
            { value: "off", label: t("tune.repeat.off"), icon: "arrow-right-to-line" },
            { value: "one", label: t("w.repeat.one"), icon: "repeat-1" },
            { value: "all", label: t("w.repeat.all"), icon: "repeat" },
          ]}
        />
      </section>

      <section className={styles.group}>
        <TipHeading title={t("w.composer")} tip={t("set.tip.composer")} />
        <Tiles<ComposerMode>
          label={t("w.composer")}
          value={composer}
          onChange={(v) => commit(withSettings({ composer: v }))}
          options={[
            {
              value: "auto",
              icon: COMPOSER_ICON.auto,
              label: t("set.comp.auto"),
              desc: t("set.comp.auto.desc"),
              badge: aiAvailable ? t("tune.slow") : undefined,
            },
            {
              value: "algorithmic",
              icon: COMPOSER_ICON.algorithmic,
              label: t("w.comp.algorithmic"),
              desc: t("tune.comp.algorithmic"),
            },
            {
              value: "ai",
              icon: COMPOSER_ICON.ai,
              label: t("w.comp.ai"),
              desc: t("tune.comp.ai"),
              badge: t("tune.slow"),
              disabled: aiAvailable === false ? t("preset.aiUnavailable") : undefined,
            },
            {
              value: "aerosol",
              icon: COMPOSER_ICON.aerosol,
              label: t("w.comp.aerosol"),
              desc: t("tune.comp.aerosol"),
            },
          ]}
        />
        <p className={styles.note}>{t(`set.comp.hint.${composer}`)}</p>
        {aiAvailable !== undefined && (
          <p className={styles.note} data-ai={aiAvailable}>
            <Icon name="info" size={16} /> {t(aiAvailable ? "set.ai.on" : "set.ai.off")}
          </p>
        )}
      </section>

      <section className={styles.group}>
        <TipHeading title={t("set.ears.title")} tip={t("set.tip.stereo")} />
        <StereoDiagram
          stereo={stereo}
          left={t("w.left")}
          right={t("w.right")}
          mono={t("set.ears.both")}
        />
        <Switch
          label={t("tune.stereo")}
          description={t("w.stereoHint")}
          checked={stereo}
          onChange={(v) => setPref("stereo", v)}
        />
        {!stereo && <p className={styles.note}>{t("set.ears.mono")}</p>}
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
        { id: "more", icon: "info", panel: <MorePanel base={base} /> },
      ]}
    />
  );
}
