import { createContext, useContext, useState, type ReactNode } from "react";
import type { ExchangeLocale } from "@/data/evolution";
import { exchangeText, type ExchangeMessageKey } from "@/lib/exchange-i18n";

const LocaleContext = createContext<{
  locale: ExchangeLocale;
  setLocale: (locale: ExchangeLocale) => void;
} | null>(null);
export function ExchangeLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<ExchangeLocale>("en");
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}
export function useExchangeLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("Exchange locale provider is missing");
  return { ...context, t: (key: ExchangeMessageKey) => exchangeText(context.locale, key) };
}
