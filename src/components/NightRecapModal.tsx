import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCountdown } from './Timer'
import { useLanguage } from '../i18n/LanguageContext'
import { translateGameLogMessage } from '../lib/gameLogTranslate'
import { GRIOT_REVEAL_KEYS } from './ActionPanel'
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
  // next_night_step, 0052_enfant_sauvage.sql) — lover_id/chosen_as_mentor
  // restent vrais tout le reste de la partie (migration 0061), mais on ne
  // les affiche ici que la toute première fois, au moment où ça vient de se
  // décider. Ces deux infos sont privées : jamais dans le journal public
  // (night_recap/entries), pour ne pas les révéler à tout le village.
  const isFirstNight = view.game.night_number === 1
  const loverName = isFirstNight && view.lover_id ? view.players.find((p) => p.user_id === view.lover_id)?.display_name : null
  // Volontairement un simple booléen (voir chosen_as_mentor, migration 0126)
  // — contrairement à loverName ci-dessus, jamais l'identité de l'Enfant
  // Sauvage : le mentor sait QU'IL a été désigné, jamais PAR QUI.
  const isMentor = isFirstNight && view.chosen_as_mentor

  // Potion de la Sorcière : contrairement au journal public (entries,
  // toujours anonyme pour le soin, et noyé parmi le reste pour le poison),
  // ces deux champs sont personnels — voir migration 0068 — et ne
  // concernent QUE la victime elle-même, jamais affichés à qui que ce soit
  // d'autre.
  const witchSavedMe = view.witch_saved_me
  const witchPoisonedMe = view.witch_poisoned_me

  // Conversion de l'Enfant Sauvage à la mort de son mentor : peut survenir
  // n'importe quelle nuit (contrairement à Cupidon/chosen_as_mentor, réservés à la
  // nuit 1), donc pas de garde `isFirstNight` ici. Strictement personnel
  // (voir migration 0069) — avant ce correctif, kill_player annonçait ce
  // changement en clair dans le journal public, révélant l'identité de
  // l'Enfant Sauvage à tout le village.
  const wildChildTurnedWolf = view.wild_child_turned_wolf

  // Bannière PUBLIQUE, visible de tout le monde (contrairement à
  // wildChildTurnedWolf ci-dessus, réservée à l'Enfant Sauvage lui-même) —
  // retour utilisateur : le reste du village doit savoir qu'un changement de
  // camp a eu lieu, sans savoir qui (voir migration 0100). Le message
  // générique existait déjà dans le journal brut (entries ci-dessous), mais
  // noyé dedans -- ce bandeau le met en avant comme les autres événements de
  // la nuit.
  const wildChildConversionThisRound = view.wild_child_conversion_this_round

  // Infection du Loup Alpha (voir migration 0088) : même principe que
  // wild_child_turned_wolf ci-dessus — strictement personnel, jamais révélé
  // à qui que ce soit d'autre (le journal public reste anonyme, "un
  // villageois a secrètement rejoint les Loups-Garous"). Peut survenir
  // n'importe quelle nuit tant que le Loup Alpha est vivant et n'a pas
  // encore utilisé son infection, donc pas de garde `isFirstNight` non plus.
  const alphaInfectedMe = view.alpha_infected_me

  // Anancy (voir migration 0119) : révèle SEULEMENT que mon rôle a changé
  // cette nuit — jamais par qui, ni vers quel rôle (je le découvrirai en
  // regardant ma propre carte). Toujours false hors 'day_reveal'.
  const anancySwappedMe = view.anancy_swapped_me

  // Qui a voté pour qui cette nuit — réservé aux Loups eux-mêmes (voir
  // migration 0113, wolf_night_recap) : null pour tout le monde d'autre,
  // jamais [] ici (get_my_game_view renvoie null hors rôle loup), donc ce
  // seul test suffit à garder l'info hors de vue des villageois.
  const wolfNightRecap = view.wolf_night_recap

  // Résultat du Griot pour la nuit qui vient de se résoudre — réservé au
  // Griot lui-même (griot_reveals ne contient rien pour les autres rôles,
  // voir migration 0116). Ajouté ICI en plus du bloc déjà affiché pendant
  // la nuit elle-même (NightResultPanel, GameRoom.tsx) : retour utilisateur
  // — sur une petite partie de test, la nuit peut s'enchaîner et se
  // résoudre en quelques secondes une fois le Griot le dernier à agir,
  // sans laisser le temps de lire quoi que ce soit pendant que le statut
  // était encore 'night'. Ce récap, lui, reste ouvert un vrai temps de
  // pause (role_reveal_seconds) garanti pour tout le monde — un filet de
  // sécurité fiable, pas une répétition inutile.
  const myGriotReveal =
    view.my_role === 'griot' ? (view.griot_reveals ?? []).find((r) => r.night_number === view.game.night_number) : null
  const griotRevealTarget = myGriotReveal
    ? view.players.find((p) => p.user_id === myGriotReveal.target_id)
    : null

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
          {(loverName ||
            isMentor ||
            witchSavedMe ||
            witchPoisonedMe ||
            wildChildTurnedWolf ||
            wildChildConversionThisRound ||
            alphaInfectedMe ||
            (wolfNightRecap && wolfNightRecap.length > 0) ||
            myGriotReveal ||
            anancySwappedMe) && (
            <div className="mb-3 flex flex-col gap-2">
              {loverName && (
                <div className="animate-fade-in rounded-xl border border-blood-500/40 bg-blood-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blood-400">{t('game.loverRevealTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.loverReveal', { name: loverName })}</p>
                </div>
              )}
              {isMentor && (
                <div className="animate-fade-in rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{t('game.mentorRevealTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.mentorReveal')}</p>
                </div>
              )}
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
              {/* Public, visible de tous (voir commentaire plus haut) —
                  affichée en plus de l'encart personnel ci-dessus s'il y en
                  a un, même patron que la potion de soin de la Sorcière
                  (message générique public + message personnel dédié). */}
              {wildChildConversionThisRound && (
                <div className="animate-fade-in rounded-xl border border-night-500/50 bg-night-700/40 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-moon-300">
                    {t('game.wildChildConversionPublicTitle')}
                  </p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.wildChildConversionPublic')}</p>
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
              {/* Anancy (voir anancySwappedMe ci-dessus) : révèle uniquement
                  QUE le rôle a changé, jamais par qui ni vers quoi — même
                  logique de discrétion que les encarts personnels ci-dessus. */}
              {anancySwappedMe && (
                <div className="animate-fade-in rounded-xl border border-moon-400/30 bg-moon-400/5 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-moon-300">{t('game.anancySwappedMeTitle')}</p>
                  <p className="mt-1 text-sm text-moon-200/90">{t('game.anancySwappedMe')}</p>
                </div>
              )}
              {/* Réservé aux Loups (voir wolfNightRecap ci-dessus) — jamais
                  visible pour un villageois, même mort : get_my_game_view ne
                  renvoie ce champ que pour les rôles loup_garou/loup_alpha. */}
              {wolfNightRecap && wolfNightRecap.length > 0 && (
                <div className="animate-fade-in rounded-xl border border-blood-500/40 bg-blood-500/10 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blood-400">
                    {t('game.wolfNightRecapTitle')}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {wolfNightRecap.map((v) => (
                      <li key={v.actor_id} className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-moon-200/90">
                        <span className="font-semibold">
                          {v.actor_name}
                          {v.is_alpha && <span className="ml-1 text-[10px] font-normal text-moon-300">Alpha</span>}
                        </span>
                        <span className="text-moon-200/60">
                          {v.target_name
                            ? `→ ${v.target_name}`
                            : v.chose_infect
                              ? t('game.wolfNightRecapInfect')
                              : t('game.wolfNightRecapAbstain')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Réservé au Griot lui-même (voir myGriotReveal ci-dessus) —
                  jamais le rôle du joueur observé, uniquement une phrase
                  générique traduite via GRIOT_REVEAL_KEYS. */}
              {myGriotReveal && (
                <div className="animate-fade-in rounded-xl border border-moon-400/30 bg-moon-400/5 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-moon-300">
                    {t('game.griotResultTitle')}
                  </p>
                  <p className="mt-1 text-sm text-moon-200/90">
                    <span className="text-moon-200">{griotRevealTarget?.display_name ?? '?'}</span>{' '}
                    {t(GRIOT_REVEAL_KEYS[myGriotReveal.kind] ?? 'griot.reveal.no_action')}
                  </p>
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
