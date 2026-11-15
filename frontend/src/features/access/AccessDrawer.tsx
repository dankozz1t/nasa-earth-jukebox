import { useState, type ReactNode } from "react";
import { getNarrator } from "../../audio/player-instance";
import { useT } from "../../shared/i18n";
import { useOverlay } from "../../shared/lib/overlays";
import { Button, Drawer, Icon, Segmented, Slider, Switch, type IconName } from "../../shared/ui";
import { SAVE_MENU_ID } from "../save/save-id";
import { TUNE_BUTTON_ID } from "../tune/tune-id";
import styles from "./access.module.css";
import { vibrationSupported, type Prefs } from "./prefs";
import { resetToSystem, setPref, usePrefs } from "./prefs.store";
import { isProfileOn, profileKeys, profilePatch, PROFILES, type Profile } from "./profiles";

interface AccessDrawerProps {
  open: boolean;
  onClose(): void;
  onDescribeMap?(): string;
}

type Scale = "1" | "1.25" | "1.5";

const TOOLS = [
  { key: "set.works.twotone", href: "https://twotone.io" },
  { key: "set.works.highcharts", href: "https://sonification.highcharts.com" },
] as const;

interface ProfileCardProps {
  profile: Profile;
  prefs: Prefs;
  canVibrate: boolean;
}

// A toggle for a whole bundle. Its name is the situation, its description lists what it turns on.
function ProfileCard({ profile, prefs, canVibrate }: ProfileCardProps) {
  const { t } = useT();
  const on = isProfileOn(profile, prefs, canVibrate);
  const id = `access-p-${profile.id}`;
  const items = profileKeys(profile, canVibrate)
    .map((k) => profile.items[k])
    .filter((key): key is string => key !== undefined)
    .map((key) => t(key));

  return (
    <button
      type="button"
      className={styles.card}
      aria-pressed={on}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-items`}
      onClick={() => usePrefs.setState(profilePatch(profile, !on, canVibrate, prefs))}
    >
      <span className={styles.cardTop}>
        <Icon name={profile.icon} size={28} />
        <span className={styles.cardMark} aria-hidden="true">
          {on && <Icon name="check" size={16} />}
        </span>
      </span>
      <span id={`${id}-name`} className={styles.cardName}>
        {t(`access.p.${profile.id}`)}
      </span>
      <span id={`${id}-items`} className={styles.cardItems}>
        {items.join(" · ")}
        {profile.id === "blind" && (
          <>
            {". "}
            <span className={styles.cardNote}>{t("access.p.blind.note")}</span>
          </>
        )}
      </span>
    </button>
  );
}

interface DisclosureProps {
  id: string;
  icon: IconName;
  title: string;
  open: boolean;
  onToggle(): void;
  children: ReactNode;
}

// The heading holds the button, so the section is still found by its heading when it is closed.
function Disclosure({ id, icon, title, open, onToggle, children }: DisclosureProps) {
  return (
    <div className={styles.disclosure} data-open={open || undefined}>
      <h3 className={styles.disclosureHeading}>
        <button
          type="button"
          className={styles.disclosureButton}
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
        >
          <Icon name={icon} />
          <span>{title}</span>
          <span className={styles.chevron}>
            <Icon name="chevron-down" />
          </span>
        </button>
      </h3>
      <div id={id} className={styles.disclosureBody} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}

export function AccessDrawer({ open, onClose, onDescribeMap }: AccessDrawerProps) {
  const { t, lang } = useT();
  const prefs = usePrefs();
  const noVoice = lang === "uk" && !getNarrator().hasVoice("uk");

  // The page's own live region sits behind the modal panel, so the description is also shown here.
  const [described, setDescribed] = useState("");
  // Closed on every visit to the page, kept while the panel opens and closes.
  const [allOpen, setAllOpen] = useState(false);
  const [worksOpen, setWorksOpen] = useState(false);
  const canVibrate = vibrationSupported();

  const found = open ? document.getElementById(SAVE_MENU_ID) : null;
  const saveMenu = found instanceof HTMLButtonElement && !found.disabled ? found : null;
  const hasSoundSettings = open && document.getElementById(TUNE_BUTTON_ID) !== null;

  const close = () => {
    setDescribed("");
    onClose();
  };

  return (
    <Drawer open={open} onClose={close} side="right" title={t("access.title")}>
      <section className={styles.profiles} aria-labelledby="access-pick">
        <h3 id="access-pick">{t("access.pick")}</h3>
        <p className={styles.note}>{t("access.pickHint")}</p>
        <div className={styles.cards}>
          {PROFILES.map((p) => (
            <ProfileCard key={p.id} profile={p} prefs={prefs} canVibrate={canVibrate} />
          ))}
        </div>
      </section>

      <div className={styles.quick}>
        {onDescribeMap && (
          <Button variant="outline" icon="map" onClick={() => setDescribed(onDescribeMap())}>
            {t("access.describeMap")}
          </Button>
        )}
        <Button
          variant="outline"
          icon="keyboard"
          aria-haspopup="dialog"
          onClick={() => {
            close();
            useOverlay.getState().show("shortcuts");
          }}
        >
          {t("help.title")}
        </Button>
      </div>
      {onDescribeMap && (
        <p role="status" className={styles.note}>
          {described}
        </p>
      )}

      <Disclosure
        id="access-all"
        icon="sliders-horizontal"
        title={t("access.all")}
        open={allOpen}
        onToggle={() => setAllOpen((o) => !o)}
      >
        <section className={styles.group} aria-labelledby="access-see">
          <h4 id="access-see">
            <Icon name="eye" /> {t("access.group.see")}
          </h4>
          <div className={styles.items}>
            <div className={styles.rowLabel} aria-hidden="true">
              <Icon name="type" />
              <span>{t("access.text")}</span>
            </div>
            <Segmented<Scale>
              label={t("access.text")}
              value={String(prefs.textScale) as Scale}
              onChange={(v) => setPref("textScale", Number(v))}
              options={[
                { value: "1", label: t("access.size.s") },
                { value: "1.25", label: t("access.size.m") },
                { value: "1.5", label: t("access.size.l") },
              ]}
            />
            <Switch
              icon="moon"
              label={t("theme.dark")}
              checked={prefs.theme === "dark"}
              onChange={(v) => setPref("theme", v ? "dark" : "light")}
            />
            <Switch
              icon="contrast"
              label={t("access.contrast")}
              checked={prefs.highContrast}
              onChange={(v) => setPref("highContrast", v)}
            />
            <Switch
              icon="palette"
              label={t("access.cvd")}
              checked={prefs.colorSafe}
              onChange={(v) => setPref("colorSafe", v)}
            />
            <Switch
              icon="case-sensitive"
              label={t("access.font")}
              checked={prefs.readableFont}
              onChange={(v) => setPref("readableFont", v)}
            />
            <Switch
              icon="waves"
              label={t("access.motion")}
              checked={prefs.reduceMotion}
              onChange={(v) => setPref("reduceMotion", v)}
            />
          </div>
        </section>

        <section className={styles.group} aria-labelledby="access-hear">
          <h4 id="access-hear">
            <Icon name="ear" /> {t("access.group.hear")}
          </h4>
          <div className={styles.items}>
            <Switch
              icon="captions"
              label={t("access.captions")}
              checked={prefs.captions}
              onChange={(v) => setPref("captions", v)}
            />
            <Switch
              icon="headphones"
              label={t("access.mono")}
              checked={!prefs.stereo}
              onChange={(v) => setPref("stereo", !v)}
            />
            {hasSoundSettings && (
              <>
                {/* Opens Sound settings only after focus has gone back to this drawer's opener. */}
                <Button
                  variant="outline"
                  icon="sliders-horizontal"
                  aria-haspopup="dialog"
                  aria-describedby="access-sound-hint"
                  onClick={() => {
                    close();
                    requestAnimationFrame(() => useOverlay.getState().show("tune"));
                  }}
                >
                  {t("set.access.link")}
                </Button>
                <p id="access-sound-hint" className={styles.note}>
                  {t("set.access.linkHint")}
                </p>
              </>
            )}
          </div>
        </section>

        <section className={styles.group} aria-labelledby="access-describe">
          <h4 id="access-describe">
            <Icon name="audio-lines" /> {t("access.group.describe")}
          </h4>
          <div className={styles.items}>
            <Switch
              icon="audio-lines"
              label={t("access.speech")}
              description={t("access.speechHint")}
              checked={prefs.speech}
              onChange={(v) => setPref("speech", v)}
            />
            <div className={styles.sliderRow}>
              <Icon name="gauge" />
              <Slider
                label={t("access.rate")}
                min={0.6}
                max={1.6}
                step={0.1}
                value={prefs.speechRate}
                onChange={(v) => setPref("speechRate", Math.round(v * 10) / 10)}
                valueText={(v) => `${v.toFixed(1)}×`}
              />
            </div>
            {noVoice && (
              <p role="note" className={styles.note}>
                {t("announce.noVoice")}
              </p>
            )}
          </div>
        </section>

        <section className={styles.group} aria-labelledby="access-feel">
          <h4 id="access-feel">
            <Icon name="vibrate" /> {t("access.group.feel")}
          </h4>
          <div className={styles.items}>
            {canVibrate ? (
              <Switch
                icon="vibrate"
                label={t("access.vibrate")}
                checked={prefs.vibrate}
                onChange={(v) => setPref("vibrate", v)}
              />
            ) : (
              <p className={styles.note}>{t("access.vibrateNo")}</p>
            )}
          </div>
        </section>

        <section className={styles.group} aria-labelledby="access-tools">
          <h4 id="access-tools">
            <Icon name="printer" /> {t("access.group.tools")}
          </h4>
          <p className={styles.note}>{t("access.tools")}</p>
          {saveMenu && (
            <Button
              variant="outline"
              icon="download"
              onClick={() => {
                close();
                // Wait until the drawer has handed focus back to its opener.
                requestAnimationFrame(() => saveMenu.focus());
              }}
            >
              {t("access.openSave")}
            </Button>
          )}
        </section>
      </Disclosure>

      <Disclosure
        id="access-works"
        icon="info"
        title={t("set.works.title")}
        open={worksOpen}
        onToggle={() => setWorksOpen((o) => !o)}
      >
        <dl className={styles.works}>
          <dt>{t("set.works.sr.title")}</dt>
          <dd>{t("set.works.sr")}</dd>
          <dt>{t("set.works.data.title")}</dt>
          <dd>
            {t("set.works.data")}
            <ul className={styles.links}>
              {TOOLS.map((tool) => (
                <li key={tool.key}>
                  <a href={tool.href} target="_blank" rel="noopener noreferrer">
                    {t(tool.key)} <Icon name="external-link" size={16} />
                    <span className="visually-hidden">{t("set.works.external")}</span>
                  </a>
                </li>
              ))}
            </ul>
          </dd>
          <dt>{t("set.works.tactile.title")}</dt>
          <dd>{t("set.works.tactile")}</dd>
          <dt>{t("set.works.captions.title")}</dt>
          <dd>{t("set.works.captions")}</dd>
        </dl>
      </Disclosure>

      <div className={styles.footer}>
        <p className={styles.note}>{t("access.intro")}</p>
        <Button variant="outline" icon="rotate-ccw" onClick={resetToSystem}>
          {t("access.reset")}
        </Button>
      </div>
    </Drawer>
  );
}
