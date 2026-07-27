import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCountdown } from './Timer'
import { useLanguage } from '../i18n/LanguageContext'
import type { MyGameView } from '../types/game'

/** Pop-up affichée juste après la résolution d'une nuit (statut
 * 'day_reveal') : résume ce qui s'est passé (journal des dernières
 * minutes) plutôt que de laisser ce récap noyé dans le fil de la page.
 * Reste ouverte 30s par défaut (role_reveal_seconds, voir migration 0041),
 * mais se ferme dès que tous les joueurs vivants cliquent sur "Continuer" —
 * même patron que VoteRecapModal / submit_vote_recap_ready. */
export function NightRecapModal({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [submitting, setSubmitting] = useState(false)
  const remaining = useCountdown(view.game.phase_deadline)

  const readyIds = view.day_reveal_ready_ids ?? []
  const aliveCount = view.players.filter((p) => p.is_alive).length
  const iAmReady = readyIds.includes(selfId)
  const iAmAlive = view.players.find((p) => p.user_id === selfId)?.is_alive ?? false
  // Uniquement les titres de CETTE nuit (voir migration 0043) — pas le
  // journal complet de la partie, qui mélangerait des messages d'autres
  // phases (débat, vote...) si peu de choses se sont passées cette nuit.
  const entries = view.night_recap ?? []

  async function handleReady() {
    setSubmitting(true)
    await supabase.rpc('submit_day_reveal_ready', { p_game_id: gameId })
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="night-recap-title"
        className="flex max-h-[85vh] w-full max-w-sm animate-modal-in flex-col rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 shadow-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-night-600/50 px-5 py-4">
          <h2 id="night-recap-title" className="flex items-center gap-2 font-display text-lg text-moon-200">
            <span>☀️</span> {t('game.dayRevealTitle')}
          </h2>
          <span className={`font-display text-sm tabular-nums ${remaining <= 10 ? 'animate-pulse text-blood-400' : 'text-moon-200/50'}`}>
            {remaining}s
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {entries.length === 0 ? (
            <p className="rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5 text-sm text-moon-200/60">
              {t('game.logEmpty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {entries.map((e) => (
                <li key={e.id} className="animate-fade-in text-sm text-moon-200/80">
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-night-600/50 px-5 py-4">
          {iAmAlive ? (
            <button
              type="button"
              onClick={handleReady}
              disabled={iAmReady || submitting}
              className="w-full rounded-xl bg-blood-600 px-4 py-2.5 text-sm font-semibold text-[#fdf6e3] transition-opacity disabled:opacity-50"
            >
              {iAmReady ? t('voteRecap.waitingOthers', { ready: readyIds.length, total: aliveCount }) : t('voteRecap.continue')}
            </button>
          ) : (
            <p className="text-center text-xs text-moon-200/40">{t('voteRecap.ghostAutoNote')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
