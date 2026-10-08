import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { cachedRpc } from '../lib/rpcCache'
import type { TribeSummary } from '../lib/tribe'

// Un seul appel léger (get_my_tribe_summary) alimente la carte de l'accueil, la
// pastille de l'onglet Tribu et l'écran de la tribu ; cachedRpc fusionne les
// lectures simultanées. Après une action (rejoindre, quitter, lire le chat…),
// `refresh` relit pour de bon. Aucune connexion temps réel ici : les « non lus »
// se calculent à l'ouverture de l'écran.
export function useTribeSummary(enabled = true) {
  const { user } = useAuth()
  const [summary, setSummary] = useState<TribeSummary | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const { data, error } = await cachedRpc<TribeSummary>('get_my_tribe_summary', undefined, { ttl: 15000, force: true })
    // Fonction pas encore en base : on reste sans tribu, sans erreur à l'écran.
    setSummary(error ? null : data)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!user || !enabled) return
    let active = true
    cachedRpc<TribeSummary>('get_my_tribe_summary', undefined, { ttl: 15000 }).then(({ data, error }) => {
      if (!active) return
      setSummary(error ? null : data)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [user, enabled])

  return { summary, loaded, refresh }
}
