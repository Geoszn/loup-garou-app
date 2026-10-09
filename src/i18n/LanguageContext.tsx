import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Lang, TranslationKey } from './translations'
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
  // Les robots d'indexation (Googlebot, Bingbot...) exécutent la page avec un
  // navigateur annonçant "en-US" : sans cette exception, un site francophone
  // serait indexé en anglais (contenu différent de ses balises françaises).
  // Même contenu que celui vu par un visiteur francophone, pas du cloaking.
  if (/bot|crawl|spider/i.test(navigator.userAgent)) return 'fr'
  // Le français reste la langue par défaut de l'appli (public principal) —
  // on ne bascule sur l'anglais que si le navigateur ne préfère explicitement
  // aucune variante du français.
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : navigator.language ? 'en' : 'fr'
}

// Un module par langue (voir i18nSplit dans vite.config.ts) : on ne charge que celle du joueur, et
// l'autre seulement s'il bascule. Les promesses sont mises en cache.
type Dictionary = Record<string, string>
const loaders: Record<Lang, () => Promise<{ default: Dictionary }>> = {
  fr: () => import('virtual:i18n-fr'),
  en: () => import('virtual:i18n-en'),
}
const loaded = new Map<Lang, Promise<Dictionary>>()
function loadDictionary(lang: Lang): Promise<Dictionary> {
  let promise = loaded.get(lang)
  if (!promise) {
    promise = loaders[lang]().then((m) => m.default)
    // En cas d'échec réseau, on oublie la promesse pour pouvoir réessayer.
    promise.catch(() => loaded.delete(lang))
    loaded.set(lang, promise)
  }
  return promise
}

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

// Le téléchargement démarre dès l'évaluation du module, sans attendre le premier rendu.
const initialLang = detectInitialLang()
void loadDictionary(initialLang).catch(() => undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [dictionary, setDictionary] = useState<Dictionary | null>(null)
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

  // Premier chargement : le dictionnaire de la langue détectée.
  useEffect(() => {
    let cancelled = false
    loadDictionary(initialLang)
      .then((d) => {
        if (!cancelled) setDictionary((current) => current ?? d)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  function setLang(next: Lang) {
    if (next === lang) return
    // On attend le dictionnaire avant de basculer, et on change les deux d'un coup : jamais d'écran
    // avec des clés brutes ni un mélange de langues.
    loadDictionary(next)
      .then((d) => {
        setDictionary(d)
        setLangState(next)
      })
      .catch(() => undefined)
  }

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    // Un texte remplacé depuis le dashboard admin passe toujours avant le
    // texte codé en dur, mais seulement s'il est réellement renseigné pour
    // CETTE langue (une override FR sans EN ne doit pas faire disparaître
    // le texte anglais par défaut).
    const override = overrides[key]?.[lang]
    let text: string = override || dictionary?.[key] || key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
      }
    }
    return text
  }

  // Premier affichage : on attend le dictionnaire (quelques dizaines de ms) plutôt que d'afficher des clés.
  if (!dictionary) return null

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage doit être utilisé sous LanguageProvider.')
  return ctx
}
