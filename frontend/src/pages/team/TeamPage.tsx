import { Link } from "react-router";
import { RouteHeading } from "../../app/RouteHeading";
import logo from "../../assets/logo-512.png";
import { useT } from "../../shared/i18n";
import { Icon, type IconName } from "../../shared/ui";
import buttonStyles from "../../shared/ui/Button.module.css";
import { BRANDS } from "./brands";
import { MARKS } from "./marks";
import styles from "./team.module.css";

type Country = "es" | "ua" | "de";
type Social = { network: "linkedin" | "tiktok"; url: string };

// Name (Latin spelling), handle (a Telegram username), socials and country are not
// translated. The Ukrainian spelling of the name, the role and "what they brought" live in the
// dictionaries as team.m{n}.*, the country as team.country.*
export const TEAM: ReadonlyArray<{
  name: string;
  handle: string;
  country: Country;
  social: Social;
}> = [
  {
    name: "Aleks Teilor Danko",
    handle: "dankozz1",
    country: "es",
    social: { network: "linkedin", url: "https://www.linkedin.com/in/dankozz1/" },
  },
  {
    name: "Sergiy Veryovka",
    handle: "ephemerian",
    country: "ua",
    social: { network: "linkedin", url: "https://www.linkedin.com/in/veryovkasergiy/" },
  },
  {
    name: "Vladyslav Zhulai",
    handle: "saiko_sakana",
    country: "ua",
    social: { network: "tiktok", url: "https://www.tiktok.com/@saiko_sakana" },
  },
  {
    name: "Nazar Drahusevych",
    handle: "NAZARUT0",
    country: "de",
    social: { network: "linkedin", url: "https://www.linkedin.com/in/nazar-drahusevych" },
  },
  {
    name: "Nazar Khozin",
    handle: "errorNum",
    country: "de",
    social: { network: "linkedin", url: "https://www.linkedin.com/in/argonaut" },
  },
  {
    name: "Ihor Moroz",
    handle: "asedeseq",
    country: "es",
    social: { network: "linkedin", url: "https://www.linkedin.com/in/remmover/" },
  },
];
export const MEMBERS = TEAM.map((m) => m.name);

const HOW: ReadonlyArray<{ n: 1 | 2 | 3; icon: IconName }> = [
  { n: 1, icon: "users" },
  { n: 2, icon: "sparkles" },
  { n: 3, icon: "layers" },
];

export default function TeamPage() {
  const { t } = useT();
  return (
    <article className={styles.page}>
      <RouteHeading className={styles.h1}>{t("team.title")}</RouteHeading>
      <section className={styles.intro}>
        <img
          className={styles.logo}
          src={logo}
          width={512}
          height={512}
          alt={t("team.logo.alt")}
          decoding="async"
        />
        <div className={styles.story}>
          <p className={styles.teamName}>{t("team.name")}</p>
          <p className={styles.challenge}>{t("team.intro")}</p>
          <p className={styles.lead}>{t("team.story")}</p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 id="team-how" className={styles.h2}>
          {t("team.how.title")}
        </h2>
        <ul className={styles.how}>
          {HOW.map(({ n, icon }) => (
            <li key={n} className={styles.howItem}>
              <span className={styles.howIcon}>
                <Icon name={icon} size={24} />
              </span>
              <h3 className={styles.h3}>{t(`team.how${n}.title`)}</h3>
              <p className={styles.howText}>{t(`team.how${n}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 id="team-people" className={styles.h2}>
          {t("team.list")}
        </h2>
        <p className={styles.note}>{t("team.handles")}</p>
        <ul className={styles.cards} aria-labelledby="team-people">
          {TEAM.map(({ name: latinName, handle, country, social }, i) => {
            const Mark = MARKS[i];
            const name = t(`team.m${i + 1}.name`);
            const net = BRANDS[social.network];
            const Telegram = BRANDS.telegram.Mark;
            return (
              <li key={latinName} className={styles.card}>
                <div className={styles.mark}>{Mark && <Mark />}</div>
                <div className={styles.text}>
                  <h3 className={styles.name}>{name}</h3>
                  <p className={styles.meta}>
                    <span>{t(`team.country.${country}`)}</span>
                  </p>
                  <div className={styles.links}>
                    <a
                      className={styles.link}
                      href={`https://t.me/${handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("team.link.telegram", { handle: `@${handle}` })}
                    >
                      <Telegram />
                      <span className={styles.handle}>@{handle}</span>
                    </a>
                    <a
                      className={`${styles.link} ${styles.iconLink}`}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("team.link.social", { network: net.label, name })}
                    >
                      <net.Mark />
                    </a>
                  </div>
                  <p className={styles.role}>{t(`team.m${i + 1}.role`)}</p>
                  <p className={styles.does}>{t(`team.m${i + 1}.does`)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <Link to="/" className={`${buttonStyles.button} ${styles.cta}`}>
        <Icon name="play" />
        {t("team.cta")}
      </Link>
    </article>
  );
}
