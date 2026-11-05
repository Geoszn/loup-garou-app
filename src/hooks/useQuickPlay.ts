import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { notifyJoinRequest } from '../lib/pushSubscription'
import type { PublicGameListing } from '../types/game'

/** Plafond d'un salon (25, voir join_game / request_join_public_game en base). */
const MAX_LOBBY_PLAYERS = 25

/**
 * « Jouer maintenant » : un seul geste pour se retrouver dans une partie.
 *  1. une demande déjà envoyée à un salon public → on retourne l'attendre ;
 *  2. sinon, le salon public ouvert le plus rempli (il démarrera le plus vite) reçoit la demande ;
 *  3. aucun salon ouvert → on crée une partie publique (un invité, qui ne peut pas créer, va sur la page Jouer).
 * Uniquement des fonctions existantes (list_public_games, request_join_public_game, create_game).
 */
export function useQuickPlay(displayName: string, isGuest: boolean) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function quickPlay() {
    setBusy(true)
    setError(null)
    try {
      const { data } = await supabase.rpc('list_public_games')
      const games = (Array.isArray(data) ? data : []) as PublicGameListing[]
      const pending = games.find((g) => g.already_requested && g.status === 'lobby')
      if (pending) {
        navigate(`/attente/${pending.game_id}`)
        return
      }
      const lobby = games
        .filter((g) => g.status === 'lobby' && !g.already_requested && g.player_count < MAX_LOBBY_PLAYERS)
        .sort((a, b) => b.player_count - a.player_count)[0]
      if (lobby) {
        const { error: rpcError } = await supabase.rpc('request_join_public_game', { p_game_id: lobby.game_id, p_display_name: displayName })
        if (rpcError) {
          setError(rpcError.message)
          return
        }
        void notifyJoinRequest(lobby.game_id)
        navigate(`/attente/${lobby.game_id}`)
        return
      }
      if (isGuest) {
        navigate('/jouer')
        return
      }
      const { data: created, error: createError } = await supabase.rpc('create_game', { p_display_name: displayName, p_settings: null, p_is_public: true })
      if (createError) {
        setError(createError.message)
        return
      }
      navigate(`/partie/${created.code}/lobby`)
    } finally {
      setBusy(false)
    }
  }

  return { quickPlay, busy, error }
}
