import { useT } from "../../shared/i18n";
import { InfoTip } from "../../shared/ui";
import styles from "./tune.module.css";

interface TipHeadingProps {
  title: string;
  tip: string;
  id?: string;
}

// A section heading with a small "i" at the row's end; the tip opens downward and leftward,
// so it stays inside the panel even at 320 px.
export function TipHeading({ title, tip, id }: TipHeadingProps) {
  const { t } = useT();

  return (
    <div className={styles.headRow}>
      <h3 id={id} className={styles.heading}>
        {title}
      </h3>
      <InfoTip label={t("set.tip.about", { name: title })} side="bottom">
        {tip}
      </InfoTip>
    </div>
  );
}
