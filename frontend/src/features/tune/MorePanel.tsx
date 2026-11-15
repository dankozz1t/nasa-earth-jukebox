import { useQueryClient } from "@tanstack/react-query";
import { getPlayer } from "../../audio/player-instance";
import {
  localizeWarning,
  useComposerStatus,
  type Soundscape,
  type WeatherSoundscape,
} from "../../shared/api";
import { rationaleText, useT } from "../../shared/i18n";
import { Button, Icon } from "../../shared/ui";
import {
  isPlayPending,
  isWeather,
  pieceOnStage,
  usePreset,
  useSession,
  type Preset,
} from "../presets";
import { playTarget } from "../stage";
import styles from "./tune.module.css";

// "Compose again" drops every live composition from the Query cache, so the server is asked anew.
const LIVE_COMPOSE_KEY = ["compose", "live"] as const;

interface MorePanelProps {
  base: Preset;
}

export function MorePanel({ base }: MorePanelProps) {
  const { t } = useT();
  const sounding = useSession((s) => s.soundscape);
  const onStage = pieceOnStage(sounding, base.source);

  return (
    <div className={styles.stack}>
      {base.source === "live" && <LiveActions />}
      <section className={styles.group} aria-labelledby="more-piece">
        <h3 id="more-piece" className={styles.heading}>
          {t("set.more.piece")}
        </h3>
        <PieceFacts s={onStage} />
      </section>
      {onStage && <ServerNotes warnings={onStage.warnings ?? []} />}
    </div>
  );
}

function PieceFacts({ s }: { s: Soundscape | WeatherSoundscape | undefined }) {
  const { t } = useT();

  if (!s) return <p className={styles.note}>{t("set.more.nothing")}</p>;
  return isWeather(s) ? <LivePiece s={s} /> : <ArchivePiece s={s} />;
}

function LiveActions() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { pick } = usePreset();
  const source = useSession((s) => s.source);
  const presetId = useSession((s) => s.presetId);
  const custom = useSession((s) => s.custom);
  const aiAvailable = useComposerStatus().data?.aiAvailable;

  function composeAgain() {
    queryClient.removeQueries({ queryKey: LIVE_COMPOSE_KEY });

    // Never starts sound: while paused it only prepares the new composition.
    void pick(playTarget(presetId, source, custom), {
      play: getPlayer().playing || isPlayPending(),
    });
  }

  return (
    <>
      <section className={styles.group} aria-labelledby="more-compose">
        <h3 id="more-compose" className={styles.heading}>
          {t("set.more.compose")}
        </h3>
        <div className={styles.actions}>
          <Button
            variant="outline"
            icon="rotate-ccw"
            onClick={composeAgain}
            aria-describedby="more-compose-hint"
          >
            {t("set.more.compose")}
          </Button>
        </div>
        <p id="more-compose-hint" className={styles.note}>
          {t("set.more.composeHint")}
        </p>
      </section>
      {aiAvailable !== undefined && (
        <section className={styles.group} aria-labelledby="more-ai">
          <h3 id="more-ai" className={styles.heading}>
            {t("set.more.ai")}
          </h3>
          <p className={styles.note} data-ai={aiAvailable}>
            <Icon name="sparkles" size={16} /> {t(aiAvailable ? "set.ai.on" : "set.ai.off")}
          </p>
        </section>
      )}
    </>
  );
}

function composerName(used: string, t: (key: string, vars?: Record<string, string>) => string) {
  if (used.startsWith("ai:")) return t("set.more.who.ai", { model: used.slice(3) });
  if (used === "aerosol") return t("set.more.who.aerosol");
  return t("set.more.who.rules");
}

function LivePiece({ s }: { s: WeatherSoundscape }) {
  const { t, lang } = useT();
  const used = s.composer?.used ?? "";
  const who = composerName(used, t);
  const rationale = rationaleText(s, lang);
  const mode = t(s.mode === "minor" ? "set.more.minor" : "set.more.major");

  return (
    <>
      <p className={styles.fact}>
        {t("set.more.pieceLine", { title: s.title, mode, tempo: s.tempoBpm ?? "" })}
      </p>
      {used && <p className={styles.fact}>{t("set.more.by", { who })}</p>}
      {rationale && <p className={styles.note}>{rationale}</p>}
    </>
  );
}

function ArchivePiece({ s }: { s: Soundscape }) {
  const { t } = useT();

  return (
    <p className={styles.fact}>
      {t("set.more.archiveLine", { mode: t(`mode.${s.mode}`), sec: Math.round(s.durationSec) })}
    </p>
  );
}

function ServerNotes({ warnings }: { warnings: readonly string[] }) {
  const { t } = useT();

  return (
    <section className={styles.group} aria-labelledby="more-notes">
      <h3 id="more-notes" className={styles.heading}>
        {t("set.more.notes")}
      </h3>
      {warnings.length === 0 ? (
        <p className={styles.note}>{t("set.more.noNotes")}</p>
      ) : (
        <ul className={styles.notes}>
          {warnings.map((w) => (
            <li key={w}>{localizeWarning(w, t)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
