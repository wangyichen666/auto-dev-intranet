import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { enUS } from './en-US';
import { zhCN, type MessageKey } from './zh-CN';
export type Locale = 'zh-CN' | 'en-US';
const LocaleContext = createContext({ locale: 'zh-CN' as Locale, setLocale: (_: Locale) => { void _; }, t: (key: MessageKey): string => zhCN[key] });
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('zh-CN');
  useEffect(() => { document.documentElement.lang = locale; document.title = `Auto Dev · ${locale === 'zh-CN' ? zhCN.subtitle : enUS.subtitle}`; }, [locale]);
  return <LocaleContext.Provider value={{ locale, setLocale, t: key => locale === 'zh-CN' ? zhCN[key] : enUS[key] }}>{children}</LocaleContext.Provider>;
}
export const useLocale = () => useContext(LocaleContext);
