import { useSyncExternalStore } from "react";
import { getLang, subscribe, t, type Lang } from "./i18n";

export function useT(): { t: typeof t; lang: Lang } {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return { t, lang };
}
