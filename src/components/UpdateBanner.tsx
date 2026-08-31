import { useState } from 'react'
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate'
import { useLanguage } from '../i18n/LanguageContext'

/** Bandeau discret, tout en haut de l'écran, affiché quand une nouvelle
 * version a été déployée pendant que cet onglet était déjà ouvert (voir
 * useServiceWorkerUpdate). But : remplacer la staleness silencieuse
 * (l'onglet continue de tourner sur l'ancien JS sans que personne s'en
 * rende compte) par un geste explicite et sans friction — recharger prend
 * une seconde et reprend exactement là où la partie en cours en était (état
 * entièrement porté par le serveur, voir RosterSummary.tsx). Pas de rechargement
 * automatique/forcé : un joueur en pleine action de nuit ne doit jamais être
 * interrompu sans y consentir. */
export function UpdateBanner() {
  const updateAvailable = useServiceWorkerUpdate()
  const [dismissed, setDismissed] = useState(false)
  const { t } = useLanguage()

  if (!updateAvailable || dismissed) return null

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 border-b border-moon-400/40 bg-night-900 px-4 py-2.5 text-sm text-moon-200 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.5)]"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.625rem)' }}
    >
      <span className="truncate">🔄 {t('update.available')}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-moon-400 px-3 py-1 text-xs font-semibold text-night-950 transition-colors hover:bg-moon-300"
      >
        {t('update.reload')}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t('common.close')}
        className="shrink-0 text-moon-200/50 transition-colors hover:text-moon-200"
      >
        ✕
      </button>
    </div>
  )
}
