import { useCallback, useEffect, useState } from 'react'
import { cachedRpc } from '../lib/rpcCache'
import { homeSection } from '../lib/homeBootstrap'
import type { MySeason } from '../types/season'

/** Saison en cours pour le joueur connecté (voir migration 0203) — null s'il
 * n'y en a aucune (et rien à réclamer d'une saison passée). Même principe de
 * polling que useActiveEvents : pas de canal Realtime dédié, un
 * rafraîchissement toutes les 30s suffit, `refresh()` permet d'en forcer un
 * immédiat après une réclamation ou une fin de partie. */
export function useMySeason() {
  const [season, setSeason] = useState<MySeason | null>(null)
  const [loading, setLoading] = useState(true)

  // `refresh()` relit pour de bon (après une réclamation, une fin de partie,
  // le sondage de 30 s) ; seule la première lecture au montage partage la
  // requête avec les annonces, qui demandent la même saison (rpcCache.ts).
  const load = useCallback((force: boolean) => {
    const request = force
      ? cachedRpc<MySeason>('get_my_season', undefined, { force: true }).then(({ data, error }) => ({ data, error: !!error }))
      : homeSection<MySeason>('season', async () => (await cachedRpc<MySeason>('get_my_season')).data).then((data) => ({ data, error: false }))
    request.then(({ data, error }) => {
      setLoading(false)
      if (error) return
      setSeason(data ?? null)
    })
  }, [])
  const refresh = useCallback(() => load(true), [load])

  useEffect(() => {
    load(false)
    // 60 s (au lieu de 30 s) et rien tant que l'onglet est caché : la saison ne
    // bouge que quand une partie se termine, et refresh() relit déjà à ce moment-là.
    const interval = setInterval(() => {
      if (!document.hidden) load(true)
    }, 60000)
    return () => clearInterval(interval)
  }, [load])

  return { season, loading, refresh }
}
