import { useLayoutEffect, useState, type ReactNode } from "react";
import { getLang, setLang, type Lang } from "./i18n";

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  // First render: nobody is subscribed yet, so setting it here renders children in the right language at once.
  useState(() => {
    if (getLang() !== lang) setLang(lang);
  });

  // Later changes notify subscribers outside render; they re-render before paint.
  useLayoutEffect(() => {
    setLang(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  return children;
}
