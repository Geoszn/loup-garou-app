// Pièces des avatars personnalisables (voir migrations 0190/0192 : profiles.
// avatar_config + set_my_avatar). Les seuils de déblocage doivent rester
// synchronisés avec avatar_part_min_points côté serveur (seule source de
// vérité : un appel direct est toujours revalidé) — ce tableau ne sert qu'à
// griser une pièce sans attendre un aller-retour réseau. Les seuils des
// pièces déjà existantes ne doivent JAMAIS être relevés : un joueur qui les a
// déjà choisies ne pourrait plus enregistrer son avatar.
export const SKIN_TONES = ['#f0c29b', '#d9a06f', '#b97a4c', '#8a5a3c', '#5c3a24', '#3e2617'] as const
export const AVATAR_BGS = ['#3b2a1c', '#2c3a2e', '#3a2530', '#26324a', '#4a3212', '#6a4a2a'] as const

export const HAIRS = [
  'none', 'fade', 'afro', 'braids', 'puffs', 'curly', 'bun', 'flat', 'cornrows', 'locs',
  'long', 'knots', 'mohawk', 'topknot', 'gele',
] as const
export const OUTFITS = [
  'tunic', 'tee', 'cloak', 'wrap', 'kente', 'dashiki', 'boubou', 'hunter', 'suit', 'hood', 'armor', 'royal', 'furcape',
] as const
export const ACCESSORIES = [
  'none', 'ring', 'freckles', 'glasses', 'sunglasses', 'hoops', 'scar', 'beads', 'facepaint', 'eyepatch',
] as const
export const HEADWEAR = ['none', 'headband', 'cap', 'hat', 'feather', 'crown'] as const
export const FACES = ['oval', 'round', 'square', 'long', 'heart'] as const

export type Hair = (typeof HAIRS)[number]
export type Outfit = (typeof OUTFITS)[number]
export type Accessory = (typeof ACCESSORIES)[number]
export type Headwear = (typeof HEADWEAR)[number]
export type FaceShape = (typeof FACES)[number]
export type AvatarMood = 'smile' | 'calm' | 'grin' | 'angry' | 'shock' | 'talk' | 'sleep' | 'dead'

export interface AvatarConfig {
  skin: number
  hair: Hair
  outfit: Outfit
  acc: Accessory
  head: Headwear
  face: FaceShape
  bg: number
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = { skin: 3, hair: 'braids', outfit: 'tunic', acc: 'none', head: 'none', face: 'oval', bg: 0 }

export const PART_MIN_POINTS: {
  hair: Record<Hair, number>
  outfit: Record<Outfit, number>
  acc: Record<Accessory, number>
  head: Record<Headwear, number>
  face: Record<FaceShape, number>
} = {
  hair: {
    none: 0, fade: 0, afro: 0, braids: 0, puffs: 0, curly: 100, bun: 100, flat: 250, cornrows: 350, locs: 250,
    long: 550, knots: 800, mohawk: 1100, topknot: 1500, gele: 600,
  },
  outfit: {
    tunic: 0, tee: 0, cloak: 100, wrap: 100, kente: 250, dashiki: 250, boubou: 350, hunter: 550, suit: 800,
    hood: 600, armor: 1100, royal: 1500, furcape: 2000,
  },
  acc: { none: 0, ring: 0, freckles: 0, glasses: 100, sunglasses: 150, hoops: 200, scar: 250, beads: 350, facepaint: 550, eyepatch: 800 },
  head: { none: 0, headband: 100, cap: 250, hat: 550, feather: 800, crown: 2000 },
  face: { oval: 0, round: 0, square: 0, long: 0, heart: 0 },
}

/** Lit une configuration reçue du serveur. Les avatars enregistrés avant
 * l'ajout de `head` (migration 0192) n'ont pas ce champ : il vaut alors
 * « aucun ». Renvoie null si la valeur n'est pas une configuration valide. */
export function parseAvatarConfig(value: unknown): AvatarConfig | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const head = v.head === undefined || v.head === null ? 'none' : v.head
  const face = v.face === undefined || v.face === null ? 'oval' : v.face
  if (
    Number.isInteger(v.skin) && (v.skin as number) >= 0 && (v.skin as number) < SKIN_TONES.length &&
    Number.isInteger(v.bg) && (v.bg as number) >= 0 && (v.bg as number) < AVATAR_BGS.length &&
    (HAIRS as readonly unknown[]).includes(v.hair) &&
    (OUTFITS as readonly unknown[]).includes(v.outfit) &&
    (ACCESSORIES as readonly unknown[]).includes(v.acc) &&
    (HEADWEAR as readonly unknown[]).includes(head) &&
    (FACES as readonly unknown[]).includes(face)
  ) {
    return { skin: v.skin as number, bg: v.bg as number, hair: v.hair as Hair, outfit: v.outfit as Outfit, acc: v.acc as Accessory, head: head as Headwear, face: face as FaceShape }
  }
  return null
}
