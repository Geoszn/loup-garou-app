import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translations, type Lang, type TranslationKey } from './translations'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'lg-lang'

// Textes de rôles/règles remplacés depuis le dashboard admin (voir migration
// 0053, table content_overrides), superposés aux textes codés en dur ci-
// dessus. Chargés une fois au démarrage — donnée publique (pas besoin d'être
// connecté), rafraîchie à chaque nouvelle session plutôt qu'en temps réel :
// un changement fait par l'admin en cours de partie n'a pas besoin d'arriver
// à la seconde près.
type ContentOverrides = Record<string, { fr?: string | null; en?: string | null }>

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
  const [overrides, setOverrides] = useState<ContentOverrides>({})

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      /* stockage indisponible : la langue reste seulement en mémoire pour cette session */
    }
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_content_overrides').then(({ data, error }) => {
      if (cancelled || error || !data) return
      setOverrides(data as ContentOverrides)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function setLang(next: Lang) {
    setLangState(next)
  }

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    // Un texte remplacé depuis le dashboard admin passe toujours avant le
    // texte codé en dur, mais seulement s'il est réellement renseigné pour
    // CETTE langue (une override FR sans EN ne doit pas faire disparaître
    // le texte anglais par défaut).
    const override = overrides[key]?.[lang]
    const entry = translations[key]
    let text: string = override || (entry ? entry[lang] : key)
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
