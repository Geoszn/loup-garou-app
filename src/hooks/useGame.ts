import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { onGameAction } from '../lib/gameRpc'
import type { MyGameView } from '../types/game'

// userId sert de clé de présence (voir plus bas) : passer l'id de
// l'utilisateur courant permet au voyant "en ligne" (PlayerGrid.tsx,
// RosterSummary.tsx) de savoir qui a l'appli ouverte en ce moment. Optionnel
// pour ne pas casser un éventuel appel existant sans présence.
/** Le serveur n'a pas la fonction demandée (migration pas encore appliquée) — PostgREST répond PGRST202. */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '')
}

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
  // Numéro de version de la partie (migration 0253) correspondant à la dernière lecture complète : tant que le serveur
  // annonce le même numéro, la vue n'a pas changé et on ne la relit pas (le sondage ne coûte qu'une lecture d'un entier).
  const versionRef = useRef<number | null>(null)
  // Dernière version annoncée par Realtime, utilisée par le rafraîchissement groupé.
  const targetVersionRef = useRef<number | null>(null)
  // false si le serveur n'a pas (encore) get_game_version : on retombe sur l'ancien sondage complet.
  const versionSupportedRef = useRef(true)
  const lastVersionCheckRef = useRef(0)
  // Après une erreur : attente croissante (1 s, 2 s, 4 s... 30 s) avec un peu d'aléa, pour que les joueurs d'une partie
  // ne relancent pas tous leurs requêtes au même instant sur une base déjà essoufflée.
  const errorStreakRef = useRef(0)
  const backoffUntilRef = useRef(0)

  const refresh = useCallback(async function refresh(knownVersion?: number): Promise<void> {
    if (!gameId) return
    if (busyRef.current) {
      pendingRef.current = true
      return
    }
    busyRef.current = true
    lastRefreshAtRef.current = Date.now()
    // La version est lue AVANT la vue : si l'état bouge entre les deux, la prochaine vérification relira la vue (jamais
    // l'inverse, qui laisserait un état périmé étiqueté « à jour »).
    let version: number | null = knownVersion ?? null
    if (version === null && versionSupportedRef.current) {
      const { data: versionData, error: versionError } = await supabase.rpc('get_game_version', { p_game_id: gameId })
      if (versionError) {
        if (isMissingFunction(versionError)) versionSupportedRef.current = false
      } else {
        version = Number(versionData)
      }
    }
    const { data, error: rpcError } = await supabase.rpc('get_my_game_view', { p_game_id: gameId })
    busyRef.current = false
    if (pendingRef.current) {
      pendingRef.current = false
      void refresh()
    }
    if (rpcError) {
      errorStreakRef.current += 1
      backoffUntilRef.current = Date.now() + Math.min(30000, 1000 * 2 ** (errorStreakRef.current - 1)) + Math.random() * 1000
      setError(rpcError.message)
      return
    }
    errorStreakRef.current = 0
    backoffUntilRef.current = 0
    versionRef.current = version
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
      const known = targetVersionRef.current
      targetVersionRef.current = null
      void refresh(known ?? undefined)
    }, Math.max(120 + Math.random() * 280, backoffUntilRef.current - Date.now()))
  }, [refresh])

  // Une action du joueur lui-même (voter, agir, se déclarer prêt...) vient
  // d'aboutir : relire l'état TOUT DE SUITE (sans le regroupement ci-dessus, la
  // confirmation doit être immédiate) — voir lib/gameRpc.ts.
  useEffect(() => onGameAction(() => void refresh()), [refresh])

  useEffect(() => {
    if (!gameId) return
    setLoading(true)
    refresh()

    const channel = supabase
      .channel(`game-${gameId}`, userId ? { config: { presence: { key: userId } } } : undefined)
      // Un seul abonnement (au lieu de trois : games, game_players, game_log) : le numéro de version de la partie monte à
      // chaque changement qui touche la vue — votes et actions de nuit compris (migration 0253).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state_version', filter: `game_id=eq.${gameId}` }, (payload) => {
        const v = Number((payload.new as { version?: number } | null)?.version)
        if (Number.isFinite(v)) {
          if (v === versionRef.current) return
          targetVersionRef.current = v
        }
        scheduleRefresh()
      })
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

  // Filet de sécurité : Realtime peut manquer un événement (canal qui vient de se ré-abonner, réplication en retard...) —
  // sans ça, un joueur pourrait rester bloqué sur un état périmé. Depuis la migration 0253, le sondage ne relit plus la
  // vue complète (~200 ms, l'appel le plus coûteux de l'appli) : il lit seulement le numéro de version de la partie
  // (une lecture indexée) toutes les 8 s (4 s si Realtime est coupé) et ne relit la vue que s'il a changé. Une lecture
  // complète reste forcée au moins une fois par minute. Rien tant que l'onglet est caché — le retour au premier plan
  // relance une lecture immédiate. Sans get_game_version côté serveur : ancien sondage complet (10 s / 5 s).
  useEffect(() => {
    if (!gameId) return
    const check = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return
      const now = Date.now()
      if (now < backoffUntilRef.current) return
      const sinceRefresh = now - lastRefreshAtRef.current
      // Sans numéro de version côté serveur : ancien sondage complet.
      if (!versionSupportedRef.current) {
        if (sinceRefresh >= (realtimeOkRef.current ? 10000 : 5000)) void refresh()
        return
      }
      // Filet de sécurité : une lecture complète au moins toutes les 60 s, quoi qu'annonce le numéro de version.
      if (sinceRefresh >= 60000) {
        void refresh()
        return
      }
      if (now - lastVersionCheckRef.current < (realtimeOkRef.current ? 8000 : 4000)) return
      lastVersionCheckRef.current = now
      const { data, error: versionError } = await supabase.rpc('get_game_version', { p_game_id: gameId })
      if (versionError) {
        if (isMissingFunction(versionError)) versionSupportedRef.current = false
        return
      }
      const v = Number(data)
      if (v !== versionRef.current) void refresh(v)
    }, 2500)
    const onVisible = () => {
      if (!document.hidden) {
        lastVersionCheckRef.current = 0
        void refresh()
      }
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
  // Le chronomètre serveur (pg_cron, migration 0251) fait déjà avancer les phases à l'heure : tant qu'il répond
  // présent, le tick des navigateurs n'est plus qu'un filet de secours, bien plus rare. S'il s'arrête, la réponse
  // repasse à faux dans les 25 s et on retrouve les ticks de 2 s (hôte) / 8 s (autres).
  const serverTickRef = useRef(false)
  const lastTickAtRef = useRef(0)
  const inProgress = !!view && view.game.status !== 'lobby' && view.game.status !== 'ended'
  useEffect(() => {
    if (!gameId || !inProgress) return
    let cancelled = false
    const check = async () => {
      const { data } = await supabase.rpc('server_tick_alive')
      if (!cancelled) serverTickRef.current = data === true
    }
    void check()
    const id = setInterval(check, 20000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [gameId, inProgress])

  useEffect(() => {
    if (!gameId || !inProgress) return

    const interval = setInterval(
      async () => {
        if (serverTickRef.current && Date.now() - lastTickAtRef.current < (amHost ? 10000 : 30000)) return
        lastTickAtRef.current = Date.now()
        await supabase.rpc('tick_game', { p_game_id: gameId })
      },
      amHost ? 2000 : 8000
    )

    return () => clearInterval(interval)
  }, [gameId, inProgress, amHost])

  // La présence n'est exposée que dans le salon d'attente : une fois la partie lancée (et après), savoir qui est
  // connecté permettrait de deviner les rôles ou les actions de nuit — on ne renvoie plus rien.
  const visibleOnlineUserIds = useMemo(() => (view?.game.status === 'lobby' ? onlineUserIds : new Set<string>()), [view?.game.status, onlineUserIds])
  return { view, loading, error, refresh, onlineUserIds: visibleOnlineUserIds }
}
