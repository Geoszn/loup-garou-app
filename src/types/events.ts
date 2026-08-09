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
