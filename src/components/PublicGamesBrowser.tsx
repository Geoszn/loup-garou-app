import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { notifyJoinRequest } from '../lib/pushSubscription'
import { Button, ErrorText } from './ui'
import { GameInProgressChoice } from './GameInProgressChoice'
import { AvatarIcon } from './AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'
import type { PublicGameListing } from '../types/game'
import { Avatar } from './Avatar'

/** Liste des parties publiques encore en salon — contenu "nu" (pas de carte
 * repliable autour), pensé pour être déposé tel quel dans la pop-up "Pour
 * rejoindre une partie" du tableau de bord (voir Dashboard.tsx). Se charge
 * dès le montage plutôt qu'à l'ouverture d'un panneau, puisque l'ouverture
 * de la pop-up EST déjà le geste explicite qui déclenche l'affichage. */
export function PublicGamesList({ displayName }: { displayName: string }) {
  const { t } = useLanguage()
  const [games, setGames] = useState<PublicGameListing[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Partie déjà en cours choisie dans la liste : affiche le choix
  // rejoindre/regarder (voir GameInProgressChoice) au lieu d'envoyer la
  // demande tout de suite — une partie encore au salon, elle, rejoint
  // directement (voir requestJoin plus bas), rien à choisir.
  const [choiceGame, setChoiceGame] = useState<PublicGameListing | null>(null)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('list_public_games')
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setGames(data ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitJoinRequest(game: PublicGameListing): Promise<boolean> {
    setRequestingId(game.game_id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('request_join_public_game', {
      p_game_id: game.game_id,
      p_display_name: displayName,
    })
    setRequestingId(null)
    if (rpcError) {
      setError(rpcError.message)
      return false
    }
    void notifyJoinRequest(game.game_id)
    return true
  }

  async function requestJoin(game: PublicGameListing) {
    if (game.status !== 'lobby') {
      setChoiceGame(game)
      return
    }
    if (await submitJoinRequest(game)) navigate(`/attente/${game.game_id}`, { state: { code: game.code } })
  }

  async function watchChosen() {
    if (!choiceGame) return
    const game = choiceGame
    if (await submitJoinRequest(game)) navigate(`/attente/${game.game_id}/observer`)
  }

  async function requestOnlyChosen() {
    if (!choiceGame) return
    const game = choiceGame
    if (await submitJoinRequest(game)) navigate(`/attente/${game.game_id}`, { state: { code: game.code } })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-moon-200/50">{t('publicGames.hostApprovalNote')}</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 text-xs text-moon-200/50 underline underline-offset-4 hover:text-moon-200 disabled:opacity-50"
        >
          {loading ? t('publicGames.refreshing') : t('publicGames.refresh')}
        </button>
      </div>

      <ErrorText>{error}</ErrorText>

      {loading && games === null && <p className="py-2 text-center text-sm text-moon-200/40">{t('publicGames.searching')}</p>}

      {games !== null && games.length === 0 && (
        <p className="py-2 text-center text-sm text-moon-200/40">{t('publicGames.empty')}</p>
      )}

      {games !== null && games.length > 0 && (
        <div className="flex flex-col gap-2">
          {games.map((g) => (
            <div
              key={g.game_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-night-700/60 bg-night-800/40 px-3 py-2.5"
            >
              <p className="flex flex-wrap items-center gap-1 text-sm text-moon-200/90">
                <Avatar config={g.host_avatar_config} icon={g.host_avatar_icon} name={g.host_name} className="h-7 w-7" />
                <strong className="text-moon-200">{g.host_name}</strong>
                <span className="ml-2 text-xs text-moon-200/40">{t('publicGames.playerCount', { count: g.player_count })}</span>
                {g.status === 'lobby' ? (
                  <span className="ml-2 rounded-full bg-emerald-700/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-400">
                    {t('publicGames.statusLobby')}
                  </span>
                ) : (
                  <span className="ml-2 rounded-full bg-blood-700/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blood-400">
                    {t('publicGames.statusInProgress')}
                  </span>
                )}
              </p>
              <Button
                className="px-3 py-1.5 text-xs"
                variant={g.already_requested ? 'ghost' : 'primary'}
                disabled={g.already_requested || requestingId === g.game_id}
                onClick={() => requestJoin(g)}
                title={g.status !== 'lobby' ? t('publicGames.inProgressTooltip') : undefined}
              >
                {g.already_requested
                  ? t('publicGames.requestSent')
                  : requestingId === g.game_id
                    ? t('publicGames.requesting')
                    : t('publicGames.requestButton')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Choix rejoindre/regarder pour une partie déjà en cours (voir
          GameInProgressChoice) — pas le Modal partagé de ui.tsx, qui
          ajoute déjà sa propre carte/en-tête autour de son contenu : ce
          composant est lui-même une carte autonome, faite pour être
          centrée directement (même patron que JoinByLink.tsx). */}
      {choiceGame && (
        <div className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={() => setChoiceGame(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <GameInProgressChoice
              onWatch={watchChosen}
              onRequestOnly={requestOnlyChosen}
              onCancel={() => setChoiceGame(null)}
              busy={requestingId === choiceGame.game_id}
            />
          </div>
        </div>
      )}
    </div>
  )
}
