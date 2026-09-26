// Pièces des avatars personnalisables (voir migration 0190 : profiles.
// avatar_config + set_my_avatar). Les seuils de déblocage doivent rester
// synchronisés avec avatar_part_min_points côté serveur (seule source de
// vérité : un appel direct est toujours revalidé) — ce tableau ne sert qu'à
// griser une pièce sans attendre un aller-retour réseau.
export const SKIN_TONES = ['#f0c29b', '#d9a06f', '#b97a4c', '#8a5a3c', '#5c3a24', '#3e2617'] as const
export const AVATAR_BGS = ['#3b2a1c', '#2c3a2e', '#3a2530', '#26324a', '#4a3212', '#6a4a2a'] as const

export const HAIRS = ['none', 'fade', 'afro', 'braids', 'locs', 'bun', 'gele'] as const
export const OUTFITS = ['tunic', 'cloak', 'kente', 'hood'] as const
export const ACCESSORIES = ['none', 'ring', 'glasses', 'scar'] as const

export type Hair = (typeof HAIRS)[number]
export type Outfit = (typeof OUTFITS)[number]
export type Accessory = (typeof ACCESSORIES)[number]
export type AvatarMood = 'smile' | 'calm' | 'grin' | 'angry' | 'shock' | 'talk' | 'sleep' | 'dead'

export interface AvatarConfig {
  skin: number
  hair: Hair
  outfit: Outfit
  acc: Accessory
  bg: number
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = { skin: 3, hair: 'braids', outfit: 'tunic', acc: 'none', bg: 0 }

export const PART_MIN_POINTS: {
  hair: Record<Hair, number>
  outfit: Record<Outfit, number>
  acc: Record<Accessory, number>
} = {
  hair: { none: 0, fade: 0, afro: 0, braids: 0, bun: 100, locs: 250, gele: 600 },
  outfit: { tunic: 0, cloak: 100, kente: 250, hood: 600 },
  acc: { none: 0, ring: 0, glasses: 100, scar: 250 },
}

export function isAvatarConfig(value: unknown): value is AvatarConfig {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    Number.isInteger(v.skin) && (v.skin as number) >= 0 && (v.skin as number) < SKIN_TONES.length &&
    Number.isInteger(v.bg) && (v.bg as number) >= 0 && (v.bg as number) < AVATAR_BGS.length &&
    (HAIRS as readonly unknown[]).includes(v.hair) &&
    (OUTFITS as readonly unknown[]).includes(v.outfit) &&
    (ACCESSORIES as readonly unknown[]).includes(v.acc)
  )
}
