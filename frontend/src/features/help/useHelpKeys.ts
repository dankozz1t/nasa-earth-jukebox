import { useHotkeys } from "../../shared/lib/useHotkeys";
import { useOverlay } from "../../shared/lib/overlays";

export function useHelpKeys(): void {
  const show = useOverlay((s) => s.show);

  useHotkeys({
    "Shift+slash": () => show("shortcuts"),
    a: () => show("access"),
  });
}
