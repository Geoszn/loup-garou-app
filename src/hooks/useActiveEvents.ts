import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameEvent } from '../types/events'

/** Événements actifs (voir migration 0067), utilisé par la bannière sur
 * Landing.tsx ET Dashboard.tsx (« Mon espace »). Pas de canal Realtime dédié
 * — un polling toutes les 30s suffit largement pour un événement qui
 * démarre ou se termine, et `refresh()` permet en plus de forcer un
 * rafraîchissement immédiat dès qu'un compte à rebours affiché atteint zéro
 * (voir EventBanner), pour que la bannière disparaisse sans attendre le
 * prochain cycle de polling ni un rechargement de page. */
export function useActiveEvents() {
  const [events, setEvents] = useState<GameEvent[]>([])

  const refresh = useCallback(() => {
    supabase.rpc('get_active_events').then(({ data }) => {
      if (data) setEvents(data as GameEvent[])
    })
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh])

  return { events, refresh }
}
