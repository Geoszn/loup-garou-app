import type { TranslationKey } from '../i18n/translations'

// Doit rester synchronisé avec rank_tier_for_points côté serveur (dernière
// version : migration 0064_longer_progression_after_scout.sql) — c'est la
// base de données qui fait foi pour calculer le palier d'un joueur, cette
// table ne sert qu'à l'affichage (badge + libellé) une fois le slug reçu du
// serveur. Seuils volontairement resserrés au début (0/100/250, pour un
// début de progression rapide et gratifiant) puis très étalés ensuite
// (600/1400/2800) — un palier élevé doit se mériter sur la durée, pas
// tomber après une poignée de parties. RankBadge.tsx et
// DashboardLeaderboard.tsx n'ont que les points bruts (pas le slug déjà
// calculé par le serveur) : ils passent par tierForPoints() ci-dessous
// plutôt que de recopier ces seuils une troisième et quatrième fois — c'est
// exactement ce genre de copie qui avait désynchronisé les seuils lors du
// dernier changement.
export type RankTier = 'nouveau_venu' | 'villageois' | 'chasseur' | 'ancien' | 'sage' | 'legende'

export interface RankTierInfo {
  id: RankTier
  minPoints: number
  nameKey: TranslationKey
}

export const RANK_TIERS: RankTierInfo[] = [
  { id: 'nouveau_venu', minPoints: 0, nameKey: 'rank.tier.nouveau_venu' },
  { id: 'villageois', minPoints: 100, nameKey: 'rank.tier.villageois' },
  { id: 'chasseur', minPoints: 250, nameKey: 'rank.tier.chasseur' },
  { id: 'ancien', minPoints: 600, nameKey: 'rank.tier.ancien' },
  { id: 'sage', minPoints: 1400, nameKey: 'rank.tier.sage' },
  { id: 'legende', minPoints: 2800, nameKey: 'rank.tier.legende' },
]

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string

export function tierInfo(tier: string | null | undefined): RankTierInfo {
  return RANK_TIERS.find((r) => r.id === tier) ?? RANK_TIERS[0]
}

/** Palier correspondant à des points bruts, calculé côté client depuis
 * RANK_TIERS — pour les rares endroits qui n'ont que rank_points sans le
 * slug déjà calculé par le serveur (RankBadge.tsx, DashboardLeaderboard.tsx).
 * Unique point de vérité client : évite que ces deux composants recopient
 * chacun leurs propres seuils en dur (c'était le cas avant, et personne ne
 * les avait mis à jour en même temps que rank_tier_for_points). */
export function tierForPoints(points: number): RankTierInfo {
  let result = RANK_TIERS[0]
  for (const tier of RANK_TIERS) {
    if (points >= tier.minPoints) result = tier
  }
  return result
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

/** Palier juste en dessous du palier donné, ou null si c'est déjà le plus bas
 * (Nouveau Venu) — sert à afficher "d'où l'on vient" à côté du palier actuel
 * (voir Stats.tsx), en complément de pointsToNextTier qui ne donne que "où
 * l'on va". Se base sur le palier lui-même (pas sur les points bruts comme
 * pointsToNextTier) : les deux restent cohérents entre eux puisque le palier
 * fourni est lui-même dérivé des points côté serveur. */
export function previousTierOf(tier: string | null | undefined): RankTierInfo | null {
  const idx = RANK_TIERS.findIndex((r) => r.id === tier)
  if (idx <= 0) return null
  return RANK_TIERS[idx - 1]
}
