import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dict, type Dict, type Lang } from "./i18n/dict";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Dict };

const I18nContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "kartochka.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ru");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved === "ru" || saved === "en") setLangState(saved);
    } catch {
      /* noop */
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* noop */
    }
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t: dict[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
