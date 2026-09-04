import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SpectatorGameView } from '../types/game'

/** Même patron que useGame.ts (RPC + Realtime + filet de sécurité toutes les
 * 2,5s), mais pour quelqu'un qui n'est pas membre de la partie : une demande
 * pour la rejoindre est en attente pendant qu'elle est en cours, et il peut
 * l'observer en lecture seule (get_spectator_game_view, migration 0140). Pas
 * de présence (rien n'affiche qui est en ligne côté spectateur) ni de tick
 * de partie (ce n'est pas à un spectateur de faire avancer le temps). */
export function useSpectatorGame(gameId: string | null) {
  const [view, setView] = useState<SpectatorGameView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const lastRawRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (!gameId) return
    if (busyRef.current) return
    busyRef.current = true
    const { data, error: rpcError } = await supabase.rpc('get_spectator_game_view', { p_game_id: gameId })
    busyRef.current = false
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    const raw = JSON.stringify(data)
    if (raw !== lastRawRef.current) {
      lastRawRef.current = raw
      setView(data as SpectatorGameView)
    }
    setLoading(false)
  }, [gameId])

  useEffect(() => {
    if (!gameId) return
    setLoading(true)
    refresh()

    const channel = supabase
      .channel(`spectate-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_log', filter: `game_id=eq.${gameId}` }, refresh)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, refresh])

  useEffect(() => {
    if (!gameId) return
    const interval = setInterval(refresh, 2500)
    return () => clearInterval(interval)
  }, [gameId, refresh])

  return { view, loading, error }
}
