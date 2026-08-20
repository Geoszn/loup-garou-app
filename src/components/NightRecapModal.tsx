import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCountdown } from './Timer'
import { useLanguage } from '../i18n/LanguageContext'
import { translateGameLogMessage } from '../lib/gameLogTranslate'
import type { MyGameView } from '../types/game'

/** Pop-up affichée juste après la résolution d'une nuit (statut
 * 'day_reveal') : résume ce qui s'est passé (journal des dernières
 * minutes) plutôt que de laisser ce récap noyé dans le fil de la page.
 * Reste ouverte 30s par défaut (role_reveal_seconds, voir migration 0041),
 * mais se ferme dès que tous les joueurs vivants cliquent sur "Continuer" —
 * même patron que VoteRecapModal / submit_vote_recap_ready. */
export function NightRecapModal({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t, lang } = useLanguage()
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

  // Cupidon et l'Enfant Sauvage n'agissent qu'à la nuit 1 (voir
  // next_night_step, 0052_enfant_sauvage.sql) — lover_id/mentee_ids restent
  // vrais tout le reste de la partie (migration 0061), mais on ne les
  // affiche ici que la toute première fois, au moment où ça vient de se
  // décider. Ces deux infos sont privées : jamais dans le journal public
  // (night_recap/entries), pour ne pas les révéler à tout le village.
  const isFirstNight = view.game.night_number === 1
  const loverName = isFirstNight && view.lover_id ? view.players.find((p) => p.user_id === view.lover_id)?.display_name : null
  const mentees = isFirstNight
    ? (view.mentee_ids ?? [])
        .map((id) => ({ id, name: view.players.find((p) => p.user_id === id)?.display_name }))
        .filter((m): m is { id: string; name: string } => !!m.name)
    : []

  // Potion de la Sorcière : contrairement au journal public (entries,
  // toujours anonyme pour le soin, et noyé parmi le reste pour le poison),
  // ces deux champs sont personnels — voir migration 0068 — et ne
  // concernent QUE la victime elle-même, jamais affichés à qui que ce soit
  // d'autre.
  const witchSavedMe = view.witch_saved_me
  const witchPoisonedMe = view.witch_poisoned_me

  // Conversion de l'Enfant Sauvage à la mort de son mentor : peut survenir
  // n'importe quelle nuit (contrairement à Cupidon/mentee_ids, réservés à la
  // nuit 1), donc pas de garde `isFirstNight` ici. Strictement personnel
  // (voir migration 0069) — avant ce correctif, kill_player annonçait ce
  // changement en clair dans le journal public, révélant l'identité de
  // l'Enfant Sauvage à tout le village.
  const wildChildTurnedWolf = view.wild_child_turned_wolf

  // Infection du Loup Alpha (voir migration 0088) : même principe que
  // wild_child_turned_wolf ci-dessus — strictement personnel, jamais révélé
  // à qui que ce soit d'autre (le journal public reste anonyme, "un
  // villageois a secrètement rejoint les Loups-Garous"). Peut survenir
  // n'importe quelle nuit tant que le Loup Alpha est vivant et n'a pas
  // encore utilisé son infection, donc pas de garde `isFirstNight` non plus.
  const alphaInfectedMe = view.alpha_infected_me

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
          {(loverName || mentees.length > 0 || witchSavedMe || witchPoisonedMe || wildChildTurnedWolf || alphaInfectedMe) && (
            <div className="mb-3 flex flex-col gap-2">
              {loverName && (
                <div className="animate-fade-in rounded-xl border border-blood-500/40 bg-blood-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blood-400">{t('game.loverRevealTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.loverReveal', { name: loverName })}</p>
                </div>
              )}
              {mentees.map((m) => (
                <div key={m.id} className="animate-fade-in rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{t('game.mentorRevealTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.mentorReveal', { name: m.name })}</p>
                </div>
              ))}
              {/* Encart personnel pour la cible de la potion — jamais visible
                  pour qui que ce soit d'autre (voir witch_saved_me/
                  witch_poisoned_me, migration 0068). Le journal public reste
                  anonyme (soin) ou noyé dans le reste (poison) ; ceci est un
                  message clair adressé directement à la victime. */}
              {witchSavedMe && (
                <div className="animate-fade-in rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{t('game.witchSavedMeTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.witchSavedMe')}</p>
                </div>
              )}
              {witchPoisonedMe && (
                <div className="animate-fade-in rounded-xl border border-blood-500/40 bg-blood-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blood-400">{t('game.witchPoisonedMeTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.witchPoisonedMe')}</p>
                </div>
              )}
              {/* Encart personnel pour l'Enfant Sauvage dont le mentor vient
                  de mourir — jamais visible pour qui que ce soit d'autre
                  (voir wild_child_turned_wolf, migration 0069). Le journal
                  public ne mentionne plus du tout cet événement. */}
              {wildChildTurnedWolf && (
                <div className="animate-fade-in rounded-xl border border-blood-500/40 bg-blood-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blood-400">{t('game.wildChildTurnedTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.wildChildTurned')}</p>
                </div>
              )}
              {/* Encart personnel pour la victime infectée par le Loup Alpha
                  — jamais visible pour qui que ce soit d'autre (voir
                  alpha_infected_me, migration 0088). */}
              {alphaInfectedMe && (
                <div className="animate-fade-in rounded-xl border border-blood-500/40 bg-blood-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blood-400">{t('game.alphaInfectedMeTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.alphaInfectedMe')}</p>
                </div>
              )}
            </div>
          )}
          {entries.length === 0 ? (
            <p className="rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5 text-sm text-moon-200/60">
              {t('game.logEmpty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {entries.map((e) => (
                <li key={e.id} className="animate-fade-in text-sm text-moon-200/80">
                  {translateGameLogMessage(e.message, lang, t)}
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
