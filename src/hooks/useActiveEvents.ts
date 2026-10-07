import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { homeSection } from '../lib/homeBootstrap'
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
    // Première lecture : section du groupé sur l'accueil (homeBootstrap.ts), appel
    // direct ailleurs (ex. page d'accueil publique, sans compte).
    homeSection<GameEvent[]>('events', async () => (await supabase.rpc('get_active_events')).data as GameEvent[] | null).then((data) => {
      if (data) setEvents(data)
    })
    // 60 s au lieu de 30 s, et rien tant que l'onglet est caché : un événement
    // qui démarre ou se termine n'a pas besoin d'une précision à la demi-minute.
    const interval = setInterval(() => {
      if (!document.hidden) refresh()
    }, 60000)
    return () => clearInterval(interval)
  }, [refresh])

  return { events, refresh }
}
