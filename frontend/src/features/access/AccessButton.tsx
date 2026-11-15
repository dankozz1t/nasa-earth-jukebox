import { useT } from "../../shared/i18n";
import { useOverlay } from "../../shared/lib/overlays";
import { Button } from "../../shared/ui";
import { AccessDrawer } from "./AccessDrawer";
import styles from "./access.module.css";

interface AccessButtonProps {
  onDescribeMap?(): string;
}

export function AccessButton({ onDescribeMap }: AccessButtonProps) {
  const { t } = useT();
  const open = useOverlay((s) => s.open === "access");
  const show = useOverlay((s) => s.show);
  const hide = useOverlay((s) => s.hide);

  return (
    <>
      <Button
        variant="outline"
        icon="person-standing"
        aria-label={t("access.title")}
        title={t("access.title")}
        aria-haspopup="dialog"
        onClick={() => show("access")}
      >
        <span className={styles.buttonText}>{t("access.title")}</span>
      </Button>
      <AccessDrawer open={open} onClose={() => hide("access")} onDescribeMap={onDescribeMap} />
    </>
  );
}
