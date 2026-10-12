import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Nombre d'articles du Loup Store apparus depuis la dernière ouverture de la boutique (voir get_store_unseen_count,
// migration 0244). Partagé par toute l'appli (barre du bas, onglet Boutique) : un seul état, une seule requête.
let unseen = 0
let lastMarkAt = 0
const listeners = new Set<(n: number) => void>()

function publish(n: number) {
  unseen = n
  listeners.forEach((fn) => fn(n))
}

/** Relit le compteur côté serveur. Une réponse partie AVANT la dernière ouverture de la boutique est ignorée : sans ça, une
 * lecture lancée juste avant l'ouverture rallumerait le point rouge qu'on vient d'éteindre. */
export async function reloadStoreUnseen(): Promise<void> {
  const startedAt = Date.now()
  const { data, error } = await supabase.rpc('get_store_unseen_count')
  if (error || startedAt < lastMarkAt) return
  publish(Number(data) || 0)
}

/** La boutique vient d'être ouverte : éteint le point rouge tout de suite, puis l'enregistre côté serveur. */
export async function markStoreSeen(): Promise<void> {
  lastMarkAt = Date.now()
  publish(0)
  await supabase.rpc('mark_store_seen')
}

export function useStoreUnseen(): number {
  const [count, setCount] = useState(unseen)
  useEffect(() => {
    listeners.add(setCount)
    setCount(unseen)
    return () => {
      listeners.delete(setCount)
    }
  }, [])
  return count
}
