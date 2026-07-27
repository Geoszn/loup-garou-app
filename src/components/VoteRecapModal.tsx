import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { roleLabel } from '../lib/roles'
import { useCountdown } from './Timer'
import { AvatarIcon } from './AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'
import type { MyGameView, PublicPlayer } from '../types/game'

/** Pop-up de récap affiché juste après le dépouillement du vote du village
 * (statut 'day_vote_recap', voir migration 0027) : qui a voté pour qui, et
 * le résultat. Reste ouvert 90s par défaut, mais se ferme dès que tous les
 * joueurs vivants ont cliqué sur "Continuer" — voir submit_vote_recap_ready. */
export function VoteRecapModal({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [submitting, setSubmitting] = useState(false)
  const remaining = useCountdown(view.game.phase_deadline)

  const votes = view.vote_recap?.votes ?? []
  const readyIds = view.vote_recap?.ready_ids ?? []
  // Qui avait le vote double PENDANT ce vote précis (peut différer du
  // Capitaine actuel si le vote l'a justement éliminé et qu'un successeur a
  // depuis été désigné — voir migration 0029).
  const captainVoterId = view.vote_recap?.captain_voter_id ?? null

  const byId = new Map<string, PublicPlayer>(view.players.map((p) => [p.user_id, p]))

  // Qui pouvait voter aujourd'hui : les vivants actuels, plus le joueur qui
  // vient tout juste d'être éliminé par ce même vote (déjà is_alive = false
  // à ce stade, kill_player ayant déjà tourné).
  const eligible = view.players.filter(
    (p) => p.is_alive || (p.death_cause === 'vote' && p.died_at_night === view.game.night_number)
  )
  const votedIds = new Set(votes.map((v) => v.voter_id))
  const abstentions = eligible.filter((p) => !votedIds.has(p.user_id))

  // Le vote du Capitaine compte double côté serveur (resolve_day_vote_deaths)
  // — on applique la même pondération ici pour que le nombre de voix affiché
  // corresponde toujours au résultat réellement appliqué.
  const tally = new Map<string, { voters: string[]; weight: number }>()
  for (const v of votes) {
    if (!v.target_id) continue
    const entry = tally.get(v.target_id) ?? { voters: [], weight: 0 }
    entry.voters.push(v.voter_id)
    entry.weight += v.voter_id === captainVoterId ? 2 : 1
    tally.set(v.target_id, entry)
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1].weight - a[1].weight)

  const eliminated = view.players.find(
    (p) => p.death_cause === 'vote' && p.died_at_night === view.game.night_number
  )

  const aliveCount = view.players.filter((p) => p.is_alive).length
  const iAmReady = readyIds.includes(selfId)
  const iAmAlive = view.players.find((p) => p.user_id === selfId)?.is_alive ?? false

  async function handleReady() {
    setSubmitting(true)
    await supabase.rpc('submit_vote_recap_ready', { p_game_id: gameId })
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vote-recap-title"
        className="flex max-h-[85vh] w-full max-w-sm animate-modal-in flex-col rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 shadow-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-night-600/50 px-5 py-4">
          <h2 id="vote-recap-title" className="font-display text-lg text-moon-200">
            {t('voteRecap.title')}
          </h2>
          <span className={`font-display text-sm tabular-nums ${remaining <= 10 ? 'animate-pulse text-blood-400' : 'text-moon-200/50'}`}>
            {remaining}s
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {eliminated ? (
            <p className="rounded-xl border border-blood-700/40 bg-blood-700/10 px-3 py-2.5 text-moon-200">
              {eliminated.revealed_role
                ? t('voteRecap.eliminatedWithRole', { name: eliminated.display_name, role: roleLabel(eliminated.revealed_role, t) })
                : t('voteRecap.eliminatedNoRole', { name: eliminated.display_name })}
            </p>
          ) : votes.filter((v) => v.target_id).length === 0 ? (
            <p className="rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5 text-moon-200/80">
              {t('voteRecap.noVotes')}
            </p>
          ) : (
            <p className="rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5 text-moon-200/80">
              {t('voteRecap.tie')}
            </p>
          )}

          {ranked.length > 0 && (
            <div className="flex flex-col gap-2">
              {ranked.map(([targetId, entry]) => {
                const target = byId.get(targetId)
                return (
                  <div key={targetId} className="rounded-xl border border-night-600/50 bg-night-800/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-semibold text-moon-200">
                        {target?.avatar_icon ? <AvatarIcon icon={target.avatar_icon} className="h-4 w-4" /> : '👤'}
                        {target?.display_name ?? t('common.playerFallback')}
                      </span>
                      <span className="shrink-0 rounded-full bg-blood-700/30 px-2 py-0.5 text-xs font-semibold text-blood-400">
                        {t('voteRecap.votesCount', { n: entry.weight })}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-moon-200/50">
                      {entry.voters
                        .map((id) => {
                          const name = byId.get(id)?.display_name ?? t('common.playerFallback')
                          return id === captainVoterId ? `🎖️ ${name} (×2)` : name
                        })
                        .join(', ')}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {abstentions.length > 0 && (
            <p className="text-xs text-moon-200/40">
              {t('voteRecap.didNotVote', { names: abstentions.map((p) => p.display_name).join(', ') })}
            </p>
          )}
        </div>

        <div className="border-t border-night-600/50 px-5 py-4">
          {iAmAlive ? (
            <button
              type="button"
              onClick={handleReady}
              disabled={iAmReady || submitting}
              // Fond rouge fixe, non lié au thème jour/nuit (comme le bouton
              // "primary" de ui.tsx) : le texte doit donc rester clair en
              // permanence plutôt que de suivre moon-200, qui devient sombre
              // en pleine journée et rendait "Continuer" illisible.
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
