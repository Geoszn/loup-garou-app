import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { cachedRpc } from '../lib/rpcCache'

/** Nombre de demandes d'amis en attente (pastille de l'onglet « Amis »). */
export function usePendingFriends(): number {
  const { user } = useAuth()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!user) return
    let active = true
    cachedRpc<{ incoming_requests?: unknown[] }>('get_my_social').then(({ data }) => {
      if (active && data) setN((data.incoming_requests ?? []).length)
    })
    return () => {
      active = false
    }
  }, [user])
  return n
}
