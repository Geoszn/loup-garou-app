import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { cachedRpc } from '../lib/rpcCache'
import type { TribeSummary } from '../lib/tribe'

// Un seul appel léger (get_my_tribe_summary) alimente la carte de l'accueil, la
// pastille de la barre du bas et l'écran de la tribu ; cachedRpc fusionne les
// lectures simultanées. Aucune connexion temps réel ici : les « non lus » se
// relisent quand l'écran revient au premier plan, toutes les `pollMs` ms tant
// qu'il est visible, et quand une autre partie de l'appli signale un changement
// (lecture du chat, réponse à une invitation…) via notifyTribeSummaryChanged.
const CHANGED_EVENT = 'tribe-summary-changed'

export function notifyTribeSummaryChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function useTribeSummary(enabled = true, pollMs = 0) {
  const { user } = useAuth()
  const [summary, setSummary] = useState<TribeSummary | null>(null)
  const [loaded, setLoaded] = useState(false)

  const fetchSummary = useCallback(async (force: boolean) => {
    const { data, error } = await cachedRpc<TribeSummary>('get_my_tribe_summary', undefined, { ttl: 15000, force })
    // Fonction pas encore en base : on reste sans tribu, sans erreur à l'écran.
    setSummary(error ? null : data)
    setLoaded(true)
  }, [])

  const refresh = useCallback(() => fetchSummary(true), [fetchSummary])

  useEffect(() => {
    if (!user || !enabled) return
    void fetchSummary(false)
    const onChanged = () => void fetchSummary(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchSummary(false)
    }
    window.addEventListener(CHANGED_EVENT, onChanged)
    document.addEventListener('visibilitychange', onVisible)
    const timer = pollMs > 0 ? setInterval(() => { if (document.visibilityState === 'visible') void fetchSummary(true) }, pollMs) : null
    return () => {
      window.removeEventListener(CHANGED_EVENT, onChanged)
      document.removeEventListener('visibilitychange', onVisible)
      if (timer) clearInterval(timer)
    }
  }, [user, enabled, pollMs, fetchSummary])

  return { summary, loaded, refresh }
}
