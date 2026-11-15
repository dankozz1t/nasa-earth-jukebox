import type { ComponentType } from "react";
import { Link } from "react-router";
import { useT } from "../../shared/i18n";
import { EarIcon, Icon, InfoTip, type IconName } from "../../shared/ui";
import buttonStyles from "../../shared/ui/Button.module.css";
import {
  CheckedArt,
  EarsArt,
  LimitsArt,
  PictureArt,
  RecordsArt,
  SourcesArt,
  TeamArt,
  TodoArt,
  TripArt,
  WeatherArt,
  WhyArt,
} from "./simple-art";
import styles from "./how.module.css";

interface Step {
  id: string;
  art?: ComponentType;
  tiles?: boolean;
  links?: boolean;
  ears?: boolean;
  tip?: boolean;
  team?: boolean;
}

// Each step is a picture, a heading and two short lines (keys how3.<id>.h, .l1, .l2). A step with
// `tip` adds one extra detail behind an "i" button (how3.<id>.tip, named by how3.<id>.tipLabel).
export const STEPS: Step[] = [
  { id: "records", art: RecordsArt },
  { id: "todo", art: TodoArt },
  { id: "trip", art: TripArt, tip: true },
  { id: "picture", art: PictureArt },
  { id: "weather", art: WeatherArt },
  { id: "checked", art: CheckedArt, tip: true },
  { id: "ears", art: EarsArt, ears: true },
  { id: "everyone", tiles: true },
  { id: "why", art: WhyArt },
  { id: "sources", art: SourcesArt, links: true },
  { id: "limits", art: LimitsArt },
  { id: "team", art: TeamArt, team: true },
];
export const LINES_PER_STEP = 2;

const TILES: { key: string; icon: IconName }[] = [
  { key: "how3.t.keys", icon: "keyboard" },
  { key: "how3.t.captions", icon: "captions" },
  { key: "how3.t.voice", icon: "audio-lines" },
  { key: "how3.t.print", icon: "printer" },
];

const SOURCES = [
  { key: "how2.link.svs", href: "https://svs.gsfc.nasa.gov/5669/" },
  {
    key: "how2.link.gibs",
    href: "https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs",
  },
  { key: "how2.link.meteo", href: "https://open-meteo.com/" },
];

function StepCard({ n, step }: { n: number; step: Step }) {
  const { t } = useT();
  const Art = step.art;
  const key = `how3.${step.id}`;
  return (
    <li className={styles.step}>
      <div className={styles.picture}>
        {Art && <Art />}
        {step.tiles && (
          <ul className={styles.tiles}>
            {TILES.map((tile) => (
              <li key={tile.key} className={styles.tile}>
                <Icon name={tile.icon} size={32} />
                <span>{t(tile.key)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.words}>
        <span className={styles.num} aria-hidden="true">
          {n}
        </span>
        <h2 id={`how-${step.id}`} className={styles.h2}>
          {t(`${key}.h`)}
        </h2>
        {Array.from({ length: LINES_PER_STEP }, (_, i) => (
          <p key={i} className={styles.line} data-kind="line">
            {t(`${key}.l${i + 1}`)}
          </p>
        ))}
        {step.ears && (
          // The two lines already say it: this legend is for the eye only.
          <p className={styles.legend} aria-hidden="true">
            <span className={styles.ear}>
              <EarIcon side="left" size={32} />
              {t("how3.ear.north")}
            </span>
            <span className={styles.ear}>
              <EarIcon side="right" size={32} />
              {t("how3.ear.south")}
            </span>
          </p>
        )}
        {step.tip && (
          <p className={styles.more}>
            <InfoTip label={t(`${key}.tipLabel`)}>{t(`${key}.tip`)}</InfoTip>
            <span aria-hidden="true">{t(`${key}.tipLabel`)}</span>
          </p>
        )}
        {step.links && (
          <ul className={styles.links} aria-label={t("how2.links.label")}>
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {t(s.key)} <span className="visually-hidden">{t("how2.external")}</span>
                  <Icon name="external-link" size={16} />
                </a>
              </li>
            ))}
          </ul>
        )}
        {step.team && (
          <Link to="/team" className={styles.link}>
            <Icon name="users" size={16} />
            {t("how3.team.link")}
          </Link>
        )}
      </div>
    </li>
  );
}

export function SimpleView() {
  const { t } = useT();
  return (
    <>
      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <StepCard key={step.id} n={i + 1} step={step} />
        ))}
      </ol>
      <Link to="/" className={`${buttonStyles.button} ${styles.cta}`}>
        <Icon name="play" />
        {t("how2.cta")}
      </Link>
    </>
  );
}
