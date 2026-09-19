import type { TranslationKey } from '../i18n/translations'

// Doit rester synchronisé avec rank_tier_for_points côté serveur (dernière
// version : migration 0159_rank_tiers_rework.sql) — c'est la base de données
// qui fait foi pour calculer le palier d'un joueur, cette table ne sert
// qu'à l'affichage (badge + libellé) une fois le slug reçu du serveur.
//
// Refonte (migration 0159, retour utilisateur : "on atteint déjà la limite
// à 4000 points, il n'y a plus de progression après") : chacun des 5
// paliers nommés (Apprenti, Éclaireur, Doyen, Sage, Légende) est désormais
// divisé en 3 sous-paliers III < II < I (III = premier échelon du groupe,
// I = dernier avant le groupe suivant — même logique que les rangs
// "Bronze III/II/I" d'autres jeux). Nouveau Venu reste seul, non subdivisé
// (c'est le tout premier palier, à 0 point, rien à graduer). Seuils
// entièrement réétalés pour atteindre 15 000 points à Légende I (au lieu
// de ~2800 pour Légende avant cette refonte) — resserrés au tout début
// (100/200/350, progression rapide et gratifiante) puis de plus en plus
// espacés (jusqu'à +4000 pour le tout dernier échelon) : un palier élevé
// doit se mériter sur la durée, pas tomber après une poignée de parties.
//
// RankBadge.tsx et DashboardLeaderboard.tsx n'ont que les points bruts (pas
// le slug déjà calculé par le serveur) : ils passent par tierForPoints()
// ci-dessous plutôt que de recopier ces seuils une troisième et quatrième
// fois — c'est exactement ce genre de copie qui avait désynchronisé les
// seuils lors d'un précédent changement.
export type RankTier =
  | 'nouveau_venu'
  | 'villageois_3'
  | 'villageois_2'
  | 'villageois_1'
  | 'chasseur_3'
  | 'chasseur_2'
  | 'chasseur_1'
  | 'ancien_3'
  | 'ancien_2'
  | 'ancien_1'
  | 'sage_3'
  | 'sage_2'
  | 'sage_1'
  | 'legende_3'
  | 'legende_2'
  | 'legende_1'

export interface RankTierInfo {
  id: RankTier
  minPoints: number
  nameKey: TranslationKey
}

export const RANK_TIERS: RankTierInfo[] = [
  { id: 'nouveau_venu', minPoints: 0, nameKey: 'rank.tier.nouveau_venu' },
  { id: 'villageois_3', minPoints: 100, nameKey: 'rank.tier.villageois_3' },
  { id: 'villageois_2', minPoints: 200, nameKey: 'rank.tier.villageois_2' },
  { id: 'villageois_1', minPoints: 350, nameKey: 'rank.tier.villageois_1' },
  { id: 'chasseur_3', minPoints: 550, nameKey: 'rank.tier.chasseur_3' },
  { id: 'chasseur_2', minPoints: 800, nameKey: 'rank.tier.chasseur_2' },
  { id: 'chasseur_1', minPoints: 1100, nameKey: 'rank.tier.chasseur_1' },
  { id: 'ancien_3', minPoints: 1500, nameKey: 'rank.tier.ancien_3' },
  { id: 'ancien_2', minPoints: 2000, nameKey: 'rank.tier.ancien_2' },
  { id: 'ancien_1', minPoints: 2700, nameKey: 'rank.tier.ancien_1' },
  { id: 'sage_3', minPoints: 3600, nameKey: 'rank.tier.sage_3' },
  { id: 'sage_2', minPoints: 4800, nameKey: 'rank.tier.sage_2' },
  { id: 'sage_1', minPoints: 6400, nameKey: 'rank.tier.sage_1' },
  { id: 'legende_3', minPoints: 8500, nameKey: 'rank.tier.legende_3' },
  { id: 'legende_2', minPoints: 11000, nameKey: 'rank.tier.legende_2' },
  { id: 'legende_1', minPoints: 15000, nameKey: 'rank.tier.legende_1' },
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

/** Groupe de palier (ex. 'legende_2' → 'legende'), indépendant du
 * sous-palier III/II/I — sert partout où l'escalade visuelle (badge, cadre
 * d'avatar en partie, déblocage de cadre) se fait par GROUPE plutôt que par
 * sous-palier : les trois échelons d'un même groupe partagent volontairement
 * le même visuel, seul le libellé (et les points requis) les distingue.
 * 'nouveau_venu' n'a pas de suffixe, renvoyé tel quel. */
export function tierGroup(tier: string | null | undefined): string {
  if (!tier) return 'nouveau_venu'
  return tier.replace(/_[123]$/, '')
}

/** Points restants avant le prochain palier, ou null si déjà au maximum
 * (Légende du Village I) — utilisé pour une petite barre de progression. */
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
