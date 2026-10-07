import { cachedRpc } from './rpcCache'

// L'accueil demande tout ce dont il a besoin en UNE requête (get_home_bootstrap,
// migration 0217) au lieu d'une quinzaine. Chaque hook / composant lit sa
// section via homeSection() ; les relectures ultérieures (sondages, après une
// action) continuent d'appeler directement leur propre fonction, plus légère.
//
// Garde-fous :
//  - uniquement sur /dashboard : les autres pages (Récompenses, Landing...)
//    n'ont besoin que d'une section, pas des huit ;
//  - si la fonction est absente (migration pas encore appliquée) ou échoue, on
//    retombe sur les requêtes individuelles et on cesse de retenter le groupé
//    pendant 5 minutes ;
//  - une section qui a échoué côté base (liste `errors`) est redemandée seule.
export interface HomeBootstrap {
  social?: unknown
  quests?: unknown
  active_game?: unknown
  app_status?: unknown
  events?: unknown
  banners?: unknown
  season?: unknown
  live_games?: unknown
  errors?: string[]
}

const UNAVAILABLE_MS = 5 * 60 * 1000
let unavailableUntil = 0

const onHome = () => typeof window !== 'undefined' && window.location.pathname === '/dashboard'

async function load(): Promise<HomeBootstrap | null> {
  if (!onHome() || Date.now() < unavailableUntil) return null
  const { data, error } = await cachedRpc<HomeBootstrap>('get_home_bootstrap', undefined, { ttl: 8000 })
  if (error || !data) {
    unavailableUntil = Date.now() + UNAVAILABLE_MS
    return null
  }
  return data
}

/** Section `key` du groupé, ou le résultat de `fallback` si le groupé n'est pas disponible. */
export async function homeSection<T>(key: Exclude<keyof HomeBootstrap, 'errors'>, fallback: () => Promise<T | null>): Promise<T | null> {
  const bootstrap = await load()
  if (bootstrap && key in bootstrap && !(bootstrap.errors ?? []).includes(key)) return (bootstrap[key] ?? null) as T | null
  return fallback()
}
