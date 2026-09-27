import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MySeason } from '../types/season'

/** Saison en cours pour le joueur connecté (voir migration 0203) — null s'il
 * n'y en a aucune (et rien à réclamer d'une saison passée). Même principe de
 * polling que useActiveEvents : pas de canal Realtime dédié, un
 * rafraîchissement toutes les 30s suffit, `refresh()` permet d'en forcer un
 * immédiat après une réclamation ou une fin de partie. */
export function useMySeason() {
  const [season, setSeason] = useState<MySeason | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    supabase.rpc('get_my_season').then(({ data, error }) => {
      setLoading(false)
      if (error) return
      setSeason((data ?? null) as MySeason | null)
    })
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh])

  return { season, loading, refresh }
}
