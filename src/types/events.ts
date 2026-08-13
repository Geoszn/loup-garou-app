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
  // client (EventBanner.tsx / AdminDashboard.tsx). Image "FR / par défaut" :
  // sert de repli si banner_image_path_en n'est pas renseignée (voir
  // migration 0076) — même principe que banner_text_fr/en juste au-dessus.
  banner_image_path: string | null
  // Image spécifique au public anglophone (voir migration 0076) — utile
  // quand le titre de l'événement est dessiné DANS l'image (pas juste en
  // texte superposé), donc forcément dans une seule langue à la fois. null
  // = pas d'image dédiée, EventBanner.tsx retombe alors sur banner_image_path.
  banner_image_path_en: string | null
  is_enabled?: boolean
  created_at?: string
}
