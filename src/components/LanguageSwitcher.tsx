import { useLanguage } from '../i18n/LanguageContext'
import type { Lang } from '../i18n/translations'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

/** Petit sélecteur FR/EN, à déposer dans les en-têtes (SignUp, Mon compte...).
 * Bascule immédiate (persistée en localStorage pour un visiteur non
 * connecté). Si un compte est connecté, le choix est en plus enregistré
 * comme langue par défaut du compte (profiles.lang, via update_my_language)
 * — c'est donc aussi le contrôle utilisé dans "Mon compte" pour changer sa
 * préférence après l'inscription. `onChanged` (optionnel) est appelé après
 * un choix effectif, ex. pour rediriger depuis la page Mon compte une fois
 * la préférence enregistrée. */
export function LanguageSwitcher({ onChanged }: { onChanged?: (lang: Lang) => void } = {}) {
  const { lang, setLang, t } = useLanguage()
  const { session, refreshProfile } = useAuth()

  async function choose(next: Lang) {
    if (next === lang) return
    setLang(next)
    if (session) {
      const { error } = await supabase.rpc('update_my_language', { p_lang: next })
      if (!error) await refreshProfile()
    }
    onChanged?.(next)
  }

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="flex items-center overflow-hidden rounded-full border border-night-600 bg-night-800/60 text-xs"
    >
      <button
        type="button"
        onClick={() => choose('fr')}
        aria-pressed={lang === 'fr'}
        className={`px-2.5 py-1.5 font-semibold transition-colors ${
          lang === 'fr' ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/50 hover:text-moon-200'
        }`}
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => choose('en')}
        aria-pressed={lang === 'en'}
        className={`px-2.5 py-1.5 font-semibold transition-colors ${
          lang === 'en' ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/50 hover:text-moon-200'
        }`}
      >
        EN
      </button>
    </div>
  )
}
