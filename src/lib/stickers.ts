// Stickers du chat de tribu. Le pack « Moi » est dessiné avec l'avatar de celui qui
// l'envoie (une humeur déjà dessinée dans l'appli + un accessoire + une légende) : le
// serveur ne stocke que l'identifiant. Même liste que tribe_sticker_ids() dans la
// migration 0228 — le serveur refuse tout identifiant qui n'y figure pas.
import type { AvatarMood } from './avatarParts'
import type { TranslationKey } from '../i18n/translations'

export interface StickerDef {
  id: string
  mood: AvatarMood
  /** Accessoire posé en haut à droite. */
  prop: string
  /** Couleur du bandeau de la légende. */
  color: string
  label: TranslationKey
}

export const STICKER_PACK_ME: StickerDef[] = [
  { id: 'gg', mood: 'grin', prop: '🏆', color: '#f0b83a', label: 'sticker.gg' },
  { id: 'haha', mood: 'grin', prop: '😂', color: '#4aa8e0', label: 'sticker.haha' },
  { id: 'grr', mood: 'angry', prop: '💢', color: '#d94a3a', label: 'sticker.grr' },
  { id: 'quoi', mood: 'shock', prop: '❓', color: '#8a5ad0', label: 'sticker.quoi' },
  { id: 'zzz', mood: 'sleep', prop: '💤', color: '#5a6ad0', label: 'sticker.zzz' },
  { id: 'chut', mood: 'calm', prop: '🤫', color: '#3aa88a', label: 'sticker.chut' },
  { id: 'bravo', mood: 'smile', prop: '👏', color: '#f08a3a', label: 'sticker.bravo' },
  { id: 'ecoutez', mood: 'talk', prop: '📣', color: '#3a8ad9', label: 'sticker.ecoutez' },
  { id: 'rip', mood: 'dead', prop: '💀', color: '#6a6a78', label: 'sticker.rip' },
  { id: 'aufeu', mood: 'angry', prop: '🔥', color: '#e0562a', label: 'sticker.aufeu' },
  { id: 'suspect', mood: 'calm', prop: '🔍', color: '#c9a03a', label: 'sticker.suspect' },
  { id: 'merci', mood: 'smile', prop: '🙏', color: '#e0568a', label: 'sticker.merci' },
]

export const stickerById = (id: string | null | undefined): StickerDef | undefined => STICKER_PACK_ME.find((s) => s.id === id)
