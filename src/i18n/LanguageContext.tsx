import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translations, type Lang, type TranslationKey } from './translations'

const STORAGE_KEY = 'lg-lang'

function detectInitialLang(): Lang {
  if (typeof window === 'undefined') return 'fr'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'fr' || stored === 'en') return stored
  } catch {
    /* stockage indisponible (navigation privée...) : on retombe sur la langue du navigateur */
  }
  // Le français reste la langue par défaut de l'appli (public principal) —
  // on ne bascule sur l'anglais que si le navigateur ne préfère explicitement
  // aucune variante du français.
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : navigator.language ? 'en' : 'fr'
}

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      /* stockage indisponible : la langue reste seulement en mémoire pour cette session */
    }
    document.documentElement.lang = lang
  }, [lang])

  function setLang(next: Lang) {
    setLangState(next)
  }

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    const entry = translations[key]
    let text: string = entry ? entry[lang] : key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
      }
    }
    return text
  }

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage doit être utilisé sous LanguageProvider.')
  return ctx
}
