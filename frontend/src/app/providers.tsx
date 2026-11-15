import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { PrefsEffects, usePrefs } from "../features/access";
import { I18nProvider } from "../shared/i18n";
import { ToastProvider } from "../shared/ui";

export function Providers({
  children,
  client: given,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  const [client] = useState(
    () =>
      given ??
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  const lang = usePrefs((p) => p.lang);

  return (
    <QueryClientProvider client={client}>
      <I18nProvider lang={lang}>
        <PrefsEffects />
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
