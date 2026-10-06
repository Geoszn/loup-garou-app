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
  // Un changement arrivé PENDANT un rafraîchissement en cours n'est plus perdu :
  // on en refait un dès que le premier se termine (avant, il était ignoré
  // jusqu'au sondage suivant).
  const pendingRef = useRef(false)
  const lastRefreshAtRef = useRef(0)
  // Realtime est-il abonné et en bonne santé ? Détermine la fréquence du filet
  // de sécurité ci-dessous : rare quand tout va bien, plus serré quand le canal
  // est coupé (plafond de débit, réseau...).
  const realtimeOkRef = useRef(false)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Dernière réponse brute reçue de l'RPC (sérialisée), pour ne déclencher
  // un `setView` — et donc un re-render de tout l'écran de jeu (grille de
  // joueurs, bannière, panneaux) — que si quelque chose a réellement changé.
  // Sans ça, le filet de sécurité toutes les 6s (voir plus bas) ET chaque
  // event Realtime (mouvement de n'importe lequel des joueurs) forçaient un
  // re-render complet même quand rien de visible ne bougeait — un des
  // principaux contributeurs au ressenti de lenteur pendant une partie.
  const lastRawRef = useRef<string | null>(null)

  const refresh = useCallback(async function refresh(): Promise<void> {
    if (!gameId) return
    if (busyRef.current) {
      pendingRef.current = true
      return
    }
    busyRef.current = true
    lastRefreshAtRef.current = Date.now()
    const { data, error: rpcError } = await supabase.rpc('get_my_game_view', { p_game_id: gameId })
    busyRef.current = false
    if (pendingRef.current) {
      pendingRef.current = false
      void refresh()
    }
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

  // Les changements Realtime déclenchent un rafraîchissement GROUPÉ : une
  // transition de phase modifie plusieurs lignes d'un coup (parties, joueurs,
  // journal) et chacun des N joueurs rappelait get_my_game_view pour CHACUN de
  // ces évènements, tous au même instant. get_my_game_view est l'appel le plus
  // coûteux de l'appli (mesuré : 102 000 appels à ~200 ms, soit plus de 5 h de
  // temps base) ; regrouper les évènements (et décaler un peu chaque client)
  // évite la rafale à chaque changement de phase.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      void refresh()
    }, 120 + Math.random() * 280)
  }, [refresh])

  useEffect(() => {
    if (!gameId) return
    setLoading(true)
    refresh()

    const channel = supabase
      .channel(`game-${gameId}`, userId ? { config: { presence: { key: userId } } } : undefined)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_log', filter: `game_id=eq.${gameId}` }, scheduleRefresh)
      .on('presence', { event: 'sync' }, () => {
        setOnlineUserIds(new Set(Object.keys(channel.presenceState())))
      })
      .subscribe(async (status) => {
        realtimeOkRef.current = status === 'SUBSCRIBED'
        if (status === 'SUBSCRIBED') {
          // Un évènement a pu être manqué pendant que le canal était coupé
          // (inutile juste après la lecture initiale).
          if (Date.now() - lastRefreshAtRef.current > 1500) void refresh()
          if (userId) await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => {
      realtimeOkRef.current = false
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
      supabase.removeChannel(channel)
      setOnlineUserIds(new Set())
    }
  }, [gameId, userId, refresh, scheduleRefresh])

  // Filet de sécurité : Realtime peut manquer un événement (ex. le canal
  // vient tout juste de se ré-abonner, ou la réplication a un peu de
  // latence) — sans ça, un joueur pourrait rester bloqué à voir un salon
  // périmé indéfiniment. On re-synchronise donc l'état à intervalle régulier
  // en plus des mises à jour Realtime, qui restent la voie rapide normale.
  // 6s plutôt que 2,5s (voir dépassement d'egress du 2026-09-28 : ce
  // sondage, multiplié par chaque joueur connecté pendant toute la durée
  // d'une partie, pesait lourd sur le volume de données sortantes du plan
  // gratuit) — Realtime reste la voie rapide pour tout changement normal,
  // ce filet ne sert qu'à rattraper un événement manqué.
  // Fréquence adaptative (audit du 2026-10-06, pg_stat_statements) : quand
  // Realtime est abonné, on ne resynchronise que toutes les 15 s ; s'il est
  // coupé (plafond de débit, réseau), on resserre à 5 s pour que la partie ne
  // reste pas figée. Rien tant que l'onglet est caché — le retour au premier
  // plan relance une lecture immédiate.
  useEffect(() => {
    if (!gameId) return
    const check = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      const limit = realtimeOkRef.current ? 15000 : 5000
      if (Date.now() - lastRefreshAtRef.current >= limit) void refresh()
    }, 2500)
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [gameId, refresh])

  // Fait avancer le temps : tick régulier tant qu'une partie est en cours.
  // tick_game est idempotente (elle ne fait rien si l'échéance n'est pas
  // atteinte, voir migration 0214), donc plusieurs clients peuvent l'appeler.
  // Pas besoin que TOUS les joueurs le fassent à 4 s : l'hôte tique toutes les
  // 2 s (c'est lui qui fait avancer les phases en pratique, et un tick à vide ne
  // coûte plus qu'une lecture depuis la migration 0214) et les autres joueurs
  // seulement toutes les 8 s, en relais si l'hôte a quitté l'onglet. Mesuré avant
  // ce changement : 124 000 appels à 38 ms, pour bien plus de joueurs que de
  // ticks nécessaires. Le changement de phase, lui, arrive à tout le monde par
  // Realtime.
  const amHost = !!userId && !!view?.players.some((p) => p.user_id === userId && p.is_host)
  useEffect(() => {
    if (!gameId) return
    if (!view || view.game.status === 'lobby' || view.game.status === 'ended') return

    const interval = setInterval(
      async () => {
        await supabase.rpc('tick_game', { p_game_id: gameId })
      },
      amHost ? 2000 : 8000
    )

    return () => clearInterval(interval)
  }, [gameId, view?.game.status, amHost])

  return { view, loading, error, refresh, onlineUserIds }
}
