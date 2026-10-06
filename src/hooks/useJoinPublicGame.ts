import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { notifyJoinRequest } from '../lib/pushSubscription'
import type { GameStatus } from '../types/game'

/** Le strict nécessaire pour demander à rejoindre une partie publique. */
export interface JoinTarget {
  game_id: string
  code: string
  status: GameStatus
}

/** Rejoindre (ou regarder) une partie publique — logique commune à la liste
 * de la page Jouer (PublicGamesBrowser.tsx) et au village de l'accueil
 * (LiveVillage.tsx). Un salon encore ouvert se rejoint directement ; une
 * partie déjà en cours ouvre d'abord le choix rejoindre/regarder (voir
 * GameInProgressChoice) au lieu d'envoyer la demande tout de suite. */
export function useJoinPublicGame(displayName: string) {
  const navigate = useNavigate()
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choiceGame, setChoiceGame] = useState<JoinTarget | null>(null)

  async function submitJoinRequest(game: JoinTarget): Promise<boolean> {
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

  async function requestJoin(game: JoinTarget) {
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

  return {
    requestingId,
    error,
    choiceGame,
    closeChoice: () => setChoiceGame(null),
    requestJoin,
    watchChosen,
    requestOnlyChosen,
  }
}

export type JoinPublicGame = ReturnType<typeof useJoinPublicGame>
