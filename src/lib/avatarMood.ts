import type { AvatarMood } from './avatarParts'
import type { GameStatus, PublicPlayer } from '../types/game'

/** Expression d'un avatar déduite UNIQUEMENT d'informations publiques (état de
 * la partie, vivant/mort, prêt) : jamais du rôle ni d'un vote en cours, pour
 * qu'une expression ne trahisse rien. La nuit, tous les vivants ont la même
 * expression (ils dorment), qu'ils agissent ou non. */
export function playerMood(
  player: Pick<PublicPlayer, 'is_alive' | 'is_ready'>,
  ctx: { status: GameStatus; deathsThisNight?: boolean; speaking?: boolean },
): AvatarMood {
  if (!player.is_alive) return 'dead'
  if (ctx.speaking) return 'talk'
  switch (ctx.status) {
    case 'role_reveal':
      return player.is_ready ? 'grin' : 'calm'
    case 'night':
      return 'sleep'
    case 'day_reveal':
      return ctx.deathsThisNight ? 'shock' : 'smile'
    case 'day_vote':
    case 'day_vote_recap':
      return 'calm'
    case 'ended':
      return 'grin'
    default:
      return 'smile'
  }
}

export function hadDeathsThisNight(players: PublicPlayer[], nightNumber: number): boolean {
  return players.some((p) => !p.is_alive && p.died_at_night === nightNumber)
}
