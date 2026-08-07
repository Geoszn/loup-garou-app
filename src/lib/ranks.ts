import type { TranslationKey } from '../i18n/translations'

// Doit rester synchronisé avec rank_tier_for_points côté serveur (migration
// 0055_ranking_system.sql) — c'est la base de données qui fait foi pour
// calculer le palier d'un joueur, cette table ne sert qu'à l'affichage
// (émoji + libellé) une fois le slug reçu du serveur.
export type RankTier = 'nouveau_venu' | 'villageois' | 'chasseur' | 'ancien' | 'sage' | 'legende'

export interface RankTierInfo {
  id: RankTier
  minPoints: number
  emoji: string
  nameKey: TranslationKey
}

export const RANK_TIERS: RankTierInfo[] = [
  { id: 'nouveau_venu', minPoints: 0, emoji: '🌱', nameKey: 'rank.tier.nouveau_venu' },
  { id: 'villageois', minPoints: 100, emoji: '🧑‍🌾', nameKey: 'rank.tier.villageois' },
  { id: 'chasseur', minPoints: 250, emoji: '🏹', nameKey: 'rank.tier.chasseur' },
  { id: 'ancien', minPoints: 500, emoji: '🕯️', nameKey: 'rank.tier.ancien' },
  { id: 'sage', minPoints: 900, emoji: '🌕', nameKey: 'rank.tier.sage' },
  { id: 'legende', minPoints: 1500, emoji: '👑', nameKey: 'rank.tier.legende' },
]

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string

export function tierInfo(tier: string | null | undefined): RankTierInfo {
  return RANK_TIERS.find((r) => r.id === tier) ?? RANK_TIERS[0]
}

export function tierLabel(tier: string | null | undefined, t: Translate): string {
  return t(tierInfo(tier).nameKey)
}

/** Points restants avant le prochain palier, ou null si déjà au maximum
 * (Légende du Village) — utilisé pour une petite barre de progression. */
export function pointsToNextTier(points: number): { next: RankTierInfo; remaining: number } | null {
  const next = RANK_TIERS.find((r) => r.minPoints > points)
  if (!next) return null
  return { next, remaining: next.minPoints - points }
}
