// Les tribus (migration 0222) : types renvoyés par les fonctions du serveur et
// constantes d'affichage (blasons, couleurs). Toutes les règles (30 membres,
// invitations, rôles, 200 messages) sont appliquées par le serveur.
import { tierForPoints, tierGroup } from './ranks'

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

// Teinte du toit des maisons du village (la tribu à ses couleurs).
export const COLOR_HEX: Record<string, string> = {
  amber: '#c98a1a',
  sky: '#3b82c4',
  emerald: '#2f9e6a',
  blood: '#b8392e',
  violet: '#7c5cc4',
  pink: '#d6458f',
}

export const emblemIcon = (id: string) => TRIBE_EMBLEMS.find((e) => e.id === id)?.icon ?? '🛡️'
export const colorGradient = (id: string) => TRIBE_COLORS.find((c) => c.id === id)?.gradient ?? TRIBE_COLORS[0].gradient

export type TribeRole = 'chef' | 'sous_chef' | 'membre'

export interface TribeInfo {
  id: string
  name: string
  motto: string | null
  emblem: TribeEmblem
  color: TribeColor
  code: string
  accepting_requests: boolean
  my_role: TribeRole
  muted_until: string | null
  max: number
  member_count: number
  unread: number
  // Demandes d'adhésion à traiter (0 si je ne suis ni chef ni sous-chef).
  pending_requests: number
  // Niveau de la tribu (migration 0225) : absents tant qu'elle n'est pas appliquée.
  xp?: number
  level?: number
  xp_floor?: number
  xp_next?: number | null
}

export interface TribeRequestOut {
  id: string
  tribe_name: string
  emblem: TribeEmblem
  color: TribeColor
  expires_at: string
}

export interface TribeRequestIn {
  id: string
  user_id: string
  username: string
  avatar_icon: string | null
  avatar_config?: unknown
  created_at: string
  expires_at: string
}

export interface TribeSearchResult {
  id: string
  name: string
  motto: string | null
  emblem: TribeEmblem
  color: TribeColor
  member_count: number
  full: boolean
  accepting: boolean
  requested: boolean
  request_id: string | null
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
  my_requests?: TribeRequestOut[]
}

/** Nombre de « choses à voir » dans la tribu : messages non lus, invitations
 * reçues, demandes à traiter. Alimente la pastille de la barre du bas. */
export function tribeAlertCount(summary: TribeSummary | null): number {
  if (!summary) return 0
  return (summary.tribe ? summary.tribe.unread + summary.tribe.pending_requests : 0) + summary.invites.length
}

export interface TribeMember {
  user_id: string
  username: string
  avatar_icon: string | null
  avatar_config?: unknown
  role: TribeRole
  joined_at: string
  muted: boolean
  // Points de rang (migration 0224) : absents tant qu'elle n'est pas appliquée.
  rank_points?: number
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
  requests_in: TribeRequestIn[]
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

/** Niveau de la case (1 à 6) : suit le groupe de rang du propriétaire
 * (nouveau venu, villageois, chasseur, ancien, sage, légende). */
export function hutLevel(rankPoints: number | undefined): number {
  const group = tierGroup(tierForPoints(rankPoints ?? 0).id)
  return Math.max(1, ['nouveau_venu', 'villageois', 'chasseur', 'ancien', 'sage', 'legende'].indexOf(group) + 1)
}

/** Sous-palier dans le groupe de rang, en losanges sous la porte : III → 1, II → 2, I → 3
 * (0 pour un nouveau venu). */
export function hutPips(rankPoints: number | undefined): number {
  const id = tierForPoints(rankPoints ?? 0).id
  const m = /_([123])$/.exec(id)
  return m ? 4 - Number(m[1]) : 0
}
