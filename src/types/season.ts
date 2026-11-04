// Saisons (voir migration 0203) : piste de paliers alimentée par de l'XP de
// saison (parties jouées, victoires, quêtes réclamées), avec des
// récompenses en Loup Coins ou en skins exclusifs à la saison.
import type { AvatarConfig } from '../lib/avatarParts'
import type { SkinCategory, SkinRarity } from '../lib/skins'

export type SeasonThemeColor = 'blush' | 'gold' | 'blood' | 'emerald' | 'violet'
export type SeasonTierRewardType = 'coins' | 'skin'
// Piste d'un palier (migration 0260) : 'free' pour tous, 'premium' avec le pass. Absent avant migration = 'free'.
export type SeasonTrackLane = 'free' | 'premium'

export interface SeasonTierRewardSkin {
  id: string
  name_fr: string
  name_en: string
  rarity: SkinRarity
  config: Partial<AvatarConfig>
  // Ajoutés par la migration 0210 — optionnels pour rester compatibles avec
  // une base pas encore migrée (le volet de détail masque alors la description).
  description_fr?: string
  description_en?: string
  category?: SkinCategory
}

export interface SeasonTier {
  id: string
  tier_number: number
  xp_required: number
  reward_type: SeasonTierRewardType
  reward_coins: number | null
  reward_skin: SeasonTierRewardSkin | null
  label_fr: string
  label_en: string
  claimed: boolean
  track?: SeasonTrackLane
}

export interface MySeason {
  id: string
  slug: string
  name_fr: string
  name_en: string
  theme_color: SeasonThemeColor
  starts_at: string
  ends_at: string
  // false = la saison est terminée mais affichée quand même parce qu'il
  // reste un palier débloqué non réclamé (voir get_my_season) — plus
  // aucune XP n'est alors gagnée, seule la réclamation reste possible.
  is_active: boolean
  // Gains d'XP par action (migration 0210) — absents avant migration.
  xp_per_game_played?: number
  xp_per_game_won?: number
  xp_per_quest_claim?: number
  xp: number
  // Pass premium (migration 0260) : prix en Loup Coins (null / absent = pas de pass), possession, solde du joueur.
  pass_price_coins?: number | null
  has_pass?: boolean
  my_loup_coins?: number
  tiers: SeasonTier[]
}
