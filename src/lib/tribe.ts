// Les tribus (migration 0222) : types renvoyés par les fonctions du serveur et
// constantes d'affichage (blasons, couleurs). Toutes les règles (30 membres,
// invitations, rôles, 200 messages) sont appliquées par le serveur.
export const TRIBE_MAX_MEMBERS = 30
export const TRIBE_NAME_MIN = 3
export const TRIBE_NAME_MAX = 24
export const TRIBE_MOTTO_MAX = 80
export const TRIBE_MESSAGE_MAX = 500

export const TRIBE_EMBLEMS = [
  { id: 'wolf', icon: '🐺' },
  { id: 'lion', icon: '🦁' },
  { id: 'eagle', icon: '🦅' },
  { id: 'elephant', icon: '🐘' },
  { id: 'globe', icon: '🌍' },
  { id: 'fire', icon: '🔥' },
  { id: 'moon', icon: '🌙' },
  { id: 'star', icon: '⭐' },
  { id: 'sunrise', icon: '🌅' },
  { id: 'scorpion', icon: '🦂' },
  { id: 'snake', icon: '🐍' },
  { id: 'shield', icon: '🛡️' },
] as const
export type TribeEmblem = (typeof TRIBE_EMBLEMS)[number]['id']

export const TRIBE_COLORS = [
  { id: 'amber', gradient: 'from-amber-500 to-amber-800' },
  { id: 'sky', gradient: 'from-sky-500 to-indigo-800' },
  { id: 'emerald', gradient: 'from-emerald-500 to-emerald-800' },
  { id: 'blood', gradient: 'from-blood-500 to-blood-800' },
  { id: 'violet', gradient: 'from-violet-500 to-violet-800' },
  { id: 'pink', gradient: 'from-pink-500 to-pink-800' },
] as const
export type TribeColor = (typeof TRIBE_COLORS)[number]['id']

export const emblemIcon = (id: string) => TRIBE_EMBLEMS.find((e) => e.id === id)?.icon ?? '🛡️'
export const colorGradient = (id: string) => TRIBE_COLORS.find((c) => c.id === id)?.gradient ?? TRIBE_COLORS[0].gradient

export type TribeRole = 'chef' | 'sous_chef' | 'membre'

export interface TribeInfo {
  id: string
  name: string
  motto: string | null
  emblem: TribeEmblem
  color: TribeColor
  my_role: TribeRole
  muted_until: string | null
  max: number
  member_count: number
  unread: number
}

export interface TribeInviteIn {
  id: string
  tribe_name: string
  emblem: TribeEmblem
  color: TribeColor
  member_count: number
  invited_by_name: string
  expires_at: string
}

export interface TribeSummary {
  tribe: TribeInfo | null
  invites: TribeInviteIn[]
}

export interface TribeMember {
  user_id: string
  username: string
  avatar_icon: string | null
  avatar_config?: unknown
  role: TribeRole
  joined_at: string
  muted: boolean
}

export interface TribeInviteOut {
  id: string
  user_id: string
  username: string
  avatar_icon: string | null
  avatar_config?: unknown
  invited_by_name: string
  expires_at: string
}

export interface TribeDetail {
  members: TribeMember[]
  invites_out: TribeInviteOut[]
  invites_today: number
  invites_limit: number
}

export interface TribeCandidate {
  user_id: string
  username: string
  avatar_icon: string | null
  avatar_config?: unknown
  is_friend: boolean
  invited: boolean
}

export interface TribeMessage {
  id: string
  kind: 'user' | 'system'
  body: string | null
  event: 'created' | 'joined' | 'left' | 'kicked' | 'promoted' | 'demoted' | 'chief' | null
  actor_name: string | null
  target_name: string | null
  created_at: string
  user_id: string | null
  username: string | null
  avatar_icon: string | null
  avatar_config?: unknown
  role: TribeRole | null
}
