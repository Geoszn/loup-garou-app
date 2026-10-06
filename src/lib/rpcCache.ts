import { supabase } from './supabase'

// À l'ouverture de l'accueil, plusieurs composants demandaient les MÊMES données
// au même moment (get_my_social : barre du bas + accueil ; get_my_quests : idem ;
// get_my_season : piste de saison + annonces). Chaque doublon coûtait une requête
// complète côté base — et ces trois appels figuraient parmi les plus lents des
// statistiques de production (150-215 ms de moyenne, pg_stat_statements du
// 2026-10-06). cachedRpc partage la requête déjà en vol et garde le résultat
// quelques secondes ; `force: true` contourne le cache (après une action du
// joueur, pour relire des données fraîches).
interface Entry {
  at: number
  promise: Promise<{ data: unknown; error: { message: string } | null }>
}
const entries = new Map<string, Entry>()
const DEFAULT_TTL_MS = 4000

export function cachedRpc<T = unknown>(
  fn: string,
  args?: Record<string, unknown>,
  opts: { ttl?: number; force?: boolean } = {}
): Promise<{ data: T | null; error: { message: string } | null }> {
  const key = fn + JSON.stringify(args ?? {})
  const existing = entries.get(key)
  if (!opts.force && existing && Date.now() - existing.at < (opts.ttl ?? DEFAULT_TTL_MS)) {
    return existing.promise as Promise<{ data: T | null; error: { message: string } | null }>
  }
  const promise = Promise.resolve(supabase.rpc(fn, args)).then((res) => {
    // Une erreur ne reste pas en cache : le prochain appel réessaie.
    if (res.error) entries.delete(key)
    return res as { data: unknown; error: { message: string } | null }
  })
  entries.set(key, { at: Date.now(), promise })
  return promise as Promise<{ data: T | null; error: { message: string } | null }>
}
