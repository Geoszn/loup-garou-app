import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { CONTINENTS } from '../lib/continents'
import { useLanguage } from '../i18n/LanguageContext'

/** Sélecteur de continent pour le classement continental (voir migration
 * 0057 — update_my_continent). Facultatif dans "Mon compte" : un joueur qui
 * ne choisit rien reste absent du classement continental mais continue
 * d'apparaître dans le mondial. Enregistré à chaque changement (pas de
 * bouton "Enregistrer" séparé), même logique immédiate que LanguageSwitcher.
 * Les nouveaux comptes le renseignent dès l'inscription (SignUp.tsx) ; les
 * comptes déjà existants sont invités via la pop-up ContinentPrompt. */
export function ContinentSelect() {
  const { profile, refreshProfile } = useAuth()
  const { t, lang } = useLanguage()
  const [saving, setSaving] = useState(false)

  async function choose(code: string) {
    setSaving(true)
    const { error } = await supabase.rpc('update_my_continent', { p_continent: code || null })
    setSaving(false)
    if (!error) await refreshProfile()
  }

  return (
    <select
      value={profile?.continent ?? ''}
      onChange={(e) => choose(e.target.value)}
      disabled={saving}
      className="rounded-full border border-night-600 bg-night-800/60 py-1.5 pl-3 pr-2 text-xs text-moon-200/80 outline-none transition-colors hover:border-moon-400/50 focus:border-moon-400/50 disabled:opacity-50"
    >
      <option value="">{t('account.continent.none')}</option>
      {CONTINENTS.map((c) => (
        <option key={c.code} value={c.code}>
          {c.emoji} {lang === 'fr' ? c.fr : c.en}
        </option>
      ))}
    </select>
  )
}
