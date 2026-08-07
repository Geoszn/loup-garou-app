import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { CONTINENTS } from '../lib/continents'
import { Button, Modal } from './ui'
import { useLanguage } from '../i18n/LanguageContext'

/** Pop-up qui s'ouvre automatiquement sur le tableau de bord tant que le
 * joueur n'a pas de continent enregistré — comptes créés avant la migration
 * 0057 (les nouveaux le choisissent déjà à l'inscription, voir SignUp.tsx,
 * et ne voient donc jamais cette pop-up). Jamais bloquante : "Plus tard"
 * la ferme pour cette visite, elle revient à la prochaine connexion tant
 * que le continent reste vide — jamais d'obligation, jamais d'accès au jeu
 * empêché. */
export function ContinentPrompt() {
  const { profile, refreshProfile } = useAuth()
  const { t, lang } = useLanguage()
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)

  const open = !!profile && !profile.continent && !dismissed

  async function choose(code: string) {
    setSaving(true)
    const { error } = await supabase.rpc('update_my_continent', { p_continent: code })
    setSaving(false)
    if (!error) await refreshProfile()
  }

  return (
    <Modal open={open} onClose={() => setDismissed(true)} title={`🌍 ${t('continentPrompt.title')}`}>
      <p className="mb-4 text-sm text-moon-200/60">{t('continentPrompt.subtitle')}</p>
      <div className="grid grid-cols-2 gap-2">
        {CONTINENTS.map((c) => (
          <button
            key={c.code}
            type="button"
            disabled={saving}
            onClick={() => choose(c.code)}
            className="flex items-center gap-2 rounded-xl border border-night-600 bg-night-800/60 px-3 py-2.5 text-sm text-moon-200/80 transition-colors hover:border-moon-400/50 hover:text-moon-200 disabled:opacity-50"
          >
            <span>{c.emoji}</span>
            {lang === 'fr' ? c.fr : c.en}
          </button>
        ))}
      </div>
      <Button variant="ghost" onClick={() => setDismissed(true)} disabled={saving} className="mt-4 w-full text-xs">
        {t('continentPrompt.skip')}
      </Button>
    </Modal>
  )
}
