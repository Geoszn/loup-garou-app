import type { AvatarConfig } from './avatarParts'

export const SKIN_CATEGORIES = ['tenues', 'coiffures', 'chapeaux', 'packs'] as const
export type SkinCategory = (typeof SKIN_CATEGORIES)[number]
export type SkinRarity = 'commun' | 'rare' | 'epique' | 'legendaire'

/** Un skin du Loup Store (voir migration 0195) : un lot de pièces d'avatar. */
export interface StoreSkin {
  id: string
  category: SkinCategory
  rarity: SkinRarity
  name_fr: string
  name_en: string
  description_fr: string
  description_en: string
  price_coins: number
  config: Partial<AvatarConfig>
  owned: boolean
}

export const RARITY_STYLE: Record<SkinRarity, { border: string; text: string; dot: string }> = {
  commun: { border: 'border-night-600/60', text: 'text-moon-200/60', dot: 'bg-moon-200/40' },
  rare: { border: 'border-sky-400/50', text: 'text-sky-300', dot: 'bg-sky-400' },
  epique: { border: 'border-purple-400/60', text: 'text-purple-300', dot: 'bg-purple-400' },
  legendaire: { border: 'border-amber-400/70', text: 'text-amber-300', dot: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]' },
}
