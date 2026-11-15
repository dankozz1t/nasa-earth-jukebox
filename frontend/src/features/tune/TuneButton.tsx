import { lazy, Suspense, useState } from "react";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { useT } from "../../shared/i18n";
import { useOverlay } from "../../shared/lib/overlays";
import { Button } from "../../shared/ui";
import { TUNE_BUTTON_ID } from "./tune-id";

const loadDrawer = () => import("./TuneDrawer");
const TuneDrawer = lazy(loadDrawer);

export function TuneButton() {
  const { t } = useT();
  const open = useOverlay((s) => s.open === "tune");
  const show = useOverlay((s) => s.show);
  const hide = useOverlay((s) => s.hide);
  const [used, setUsed] = useState(open);
  if (open && !used) setUsed(true);

  return (
    <>
      <Button
        id={TUNE_BUTTON_ID}
        variant="outline"
        icon="sliders-horizontal"
        aria-haspopup="dialog"
        onPointerEnter={() => void loadDrawer()}
        onFocus={() => void loadDrawer()}
        onClick={() => show("tune")}
      >
        {t("tune.open")}
      </Button>
      {used && (
        <ErrorBoundary variant="drawer">
          <Suspense fallback={null}>
            <TuneDrawer open={open} onClose={() => hide("tune")} />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
