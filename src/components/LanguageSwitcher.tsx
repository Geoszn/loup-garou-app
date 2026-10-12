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
export function LanguageSwitcher({
  onChanged,
  fill = false,
}: {
  onChanged?: (lang: Lang) => void
  /** Variante "champ de formulaire" (SignUp) : même hauteur qu'un champ de
   * saisie, boutons de largeur égale — au lieu de la petite pilule d'en-tête. */
  fill?: boolean
} = {}) {
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
      className={`flex shrink-0 items-center overflow-hidden border border-night-600 bg-night-800/60 ${
        fill ? 'h-[46px] rounded-xl text-sm' : 'rounded-full text-xs'
      }`}
    >
      <button
        type="button"
        onClick={() => choose('fr')}
        aria-pressed={lang === 'fr'}
        className={`${fill ? 'h-full w-12' : 'px-2.5 py-1.5'} font-semibold transition-colors ${
          lang === 'fr' ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/50 hover:text-moon-200'
        }`}
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => choose('en')}
        aria-pressed={lang === 'en'}
        className={`${fill ? 'h-full w-12' : 'px-2.5 py-1.5'} font-semibold transition-colors ${
          lang === 'en' ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/50 hover:text-moon-200'
        }`}
      >
        EN
      </button>
    </div>
  )
}
