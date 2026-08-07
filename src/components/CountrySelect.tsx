import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { COUNTRIES, countryFlag } from '../lib/countries'
import { useLanguage } from '../i18n/LanguageContext'

/** Sélecteur de pays pour le classement national (voir migration 0055 —
 * update_my_country). Facultatif : un joueur qui ne choisit rien reste
 * absent du classement national mais continue d'apparaître dans le mondial.
 * Enregistré à chaque changement (pas de bouton "Enregistrer" séparé), même
 * logique immédiate que LanguageSwitcher. */
export function CountrySelect() {
  const { profile, refreshProfile } = useAuth()
  const { t, lang } = useLanguage()
  const [saving, setSaving] = useState(false)

  async function choose(code: string) {
    setSaving(true)
    const { error } = await supabase.rpc('update_my_country', { p_country: code || null })
    setSaving(false)
    if (!error) await refreshProfile()
  }

  return (
    <select
      value={profile?.country ?? ''}
      onChange={(e) => choose(e.target.value)}
      disabled={saving}
      className="rounded-full border border-night-600 bg-night-800/60 py-1.5 pl-3 pr-2 text-xs text-moon-200/80 outline-none transition-colors hover:border-moon-400/50 focus:border-moon-400/50 disabled:opacity-50"
    >
      <option value="">{t('account.country.none')}</option>
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {countryFlag(c.code)} {lang === 'fr' ? c.fr : c.en}
        </option>
      ))}
    </select>
  )
}
