// Événements administrés depuis le dashboard admin (voir migration 0067) —
// une bannière sur la page d'accueil pendant leur période, avec un bonus de
// points optionnel appliqué dans apply_rank_result.
export type EventBonusType = 'none' | 'flat' | 'multiplier'
export type EventBannerColor = 'gold' | 'blood' | 'emerald' | 'violet'

export interface GameEvent {
  id: string
  name: string
  starts_at: string
  ends_at: string
  // Date optionnelle à partir de laquelle la bannière devient visible AVANT
  // le vrai début de l'événement (voir migration 0075) — pour "hyper" un
  // événement à venir sans activer son bonus de points en avance (le bonus,
  // lui, continue de se déclencher exactement entre starts_at et ends_at,
  // voir apply_rank_result, jamais affecté par ce champ). null = pas
  // d'aperçu, comportement d'avant (bannière visible seulement une fois
  // l'événement réellement commencé).
  preview_starts_at: string | null
  bonus_type: EventBonusType
  bonus_value: number
  banner_text_fr: string
  banner_text_en: string
  banner_color: EventBannerColor
  // Chemin de l'objet dans le bucket "event-banners", pas l'URL complète —
  // voir supabase.storage.from('event-banners').getPublicUrl(...) côté
  // client (EventBanner.tsx / AdminDashboard.tsx).
  banner_image_path: string | null
  is_enabled?: boolean
  created_at?: string
}
