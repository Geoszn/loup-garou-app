import type { TranslationKey } from '../i18n/translations'

// Titres liés au nombre de parties JOUÉES (get_my_stats -> games_played),
// indépendants des points de rang — un joueur assidu mais qui ne gagne pas
// forcément débloque quand même quelque chose, ce que le système de paliers
// seul ne permettait pas. Calculé entièrement côté client à partir d'une
// valeur déjà renvoyée par get_my_stats : aucune colonne ni migration
// nécessaire, même principe que tierForPoints (lib/ranks.ts) mais sur
// rank_games_played plutôt que rank_points.
export interface VolumeTitleInfo {
  id: string
  minGames: number
  nameKey: TranslationKey
}

export const VOLUME_TITLES: VolumeTitleInfo[] = [
  { id: 'recrue', minGames: 0, nameKey: 'volume.title.recrue' },
  { id: 'habitue', minGames: 10, nameKey: 'volume.title.habitue' },
  { id: 'pilier', minGames: 50, nameKey: 'volume.title.pilier' },
  { id: 'veteran', minGames: 100, nameKey: 'volume.title.veteran' },
  { id: 'legende_assidue', minGames: 500, nameKey: 'volume.title.legende_assidue' },
]

export function volumeTitleForGames(games: number): VolumeTitleInfo {
  let result = VOLUME_TITLES[0]
  for (const title of VOLUME_TITLES) {
    if (games >= title.minGames) result = title
  }
  return result
}

/** Parties restantes avant le prochain titre, ou null si déjà au maximum —
 * même principe que pointsToNextTier (lib/ranks.ts). */
export function nextVolumeTitle(games: number): { next: VolumeTitleInfo; remaining: number } | null {
  const next = VOLUME_TITLES.find((v) => v.minGames > games)
  if (!next) return null
  return { next, remaining: next.minGames - games }
}
