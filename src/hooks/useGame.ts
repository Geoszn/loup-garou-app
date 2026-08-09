import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MyGameView } from '../types/game'

// userId sert de clé de présence (voir plus bas) : passer l'id de
// l'utilisateur courant permet au voyant "en ligne" (PlayerGrid.tsx,
// RosterSummary.tsx) de savoir qui a l'appli ouverte en ce moment. Optionnel
// pour ne pas casser un éventuel appel existant sans présence.
export function useGame(gameId: string | null, userId: string | null = null) {
  const [view, setView] = useState<MyGameView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Ids des joueurs actuellement connectés (onglet ouvert), via la présence
  // Realtime Supabase sur le même canal que les mises à jour de la partie —
  // pas besoin de colonne "last_seen" en base, l'état est éphémère et
  // recalculé à chaque (re)connexion.
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const busyRef = useRef(false)
  // Dernière réponse brute reçue de l'RPC (sérialisée), pour ne déclencher
  // un `setView` — et donc un re-render de tout l'écran de jeu (grille de
  // joueurs, bannière, panneaux) — que si quelque chose a réellement changé.
  // Sans ça, le filet de sécurité toutes les 2,5s (voir plus bas) ET chaque
  // event Realtime (mouvement de n'importe lequel des joueurs) forçaient un
  // re-render complet même quand rien de visible ne bougeait — un des
  // principaux contributeurs au ressenti de lenteur pendant une partie.
  const lastRawRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (!gameId) return
    if (busyRef.current) return
    busyRef.current = true
    const { data, error: rpcError } = await supabase.rpc('get_my_game_view', { p_game_id: gameId })
    busyRef.current = false
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    const raw = JSON.stringify(data)
    if (raw !== lastRawRef.current) {
      lastRawRef.current = raw
      setView(data as MyGameView)
    }
    setLoading(false)
  }, [gameId])

  useEffect(() => {
    if (!gameId) return
    setLoading(true)
    refresh()

    const channel = supabase
      .channel(`game-${gameId}`, userId ? { config: { presence: { key: userId } } } : undefined)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_log', filter: `game_id=eq.${gameId}` }, refresh)
      .on('presence', { event: 'sync' }, () => {
        setOnlineUserIds(new Set(Object.keys(channel.presenceState())))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && userId) {
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
      setOnlineUserIds(new Set())
    }
  }, [gameId, userId, refresh])

  // Filet de sécurité : Realtime peut manquer un événement (ex. le canal
  // vient tout juste de se ré-abonner, ou la réplication a un peu de
  // latence) — sans ça, un joueur pourrait rester bloqué à voir un salon
  // périmé indéfiniment. On re-synchronise donc l'état à intervalle régulier
  // en plus des mises à jour Realtime, qui restent la voie rapide normale.
  useEffect(() => {
    if (!gameId) return
    const interval = setInterval(refresh, 2500)
    return () => clearInterval(interval)
  }, [gameId, refresh])

  // Fait avancer le temps : tick régulier tant qu'une partie est en cours.
  // La fonction SQL est idempotente (elle ne fait rien si le délai n'est pas
  // écoulé), donc plusieurs clients peuvent l'appeler sans risque.
  useEffect(() => {
    if (!gameId) return
    if (!view || view.game.status === 'lobby' || view.game.status === 'ended') return

    const interval = setInterval(async () => {
      await supabase.rpc('tick_game', { p_game_id: gameId })
    }, 1500)

    return () => clearInterval(interval)
  }, [gameId, view?.game.status])

  return { view, loading, error, refresh, onlineUserIds }
}
