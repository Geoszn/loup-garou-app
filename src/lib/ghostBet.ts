// « Pronostic des fantômes » (migration 0221) : les types renvoyés par
// get_ghost_bet_state / place_ghost_bet. Les cotes et toutes les règles sont
// calculées par le serveur ; ce fichier ne fait que les décrire.
export const GHOST_STAKES = [5, 10, 25, 50] as const
export type GhostCamp = 'village' | 'loups' | 'autre'

export interface GhostBetRow {
  kind: 'camp' | 'survivor'
  pick: string
  stake: number
  odds: number
  result: 'won' | 'lost' | 'refunded' | null
  payout: number
}

export interface GhostBetState {
  can_bet: boolean
  // not_dead | left | revival_pending | status | bots | too_few | decided | daily_cap | game
  reason: string | null
  market: {
    open: boolean
    reason: string | null
    alive: number
    odds: Record<GhostCamp, number>
    survivor_odds: number
  }
  balance: number
  net_24h: number
  daily_cap: number
  my_bets: GhostBetRow[]
  ghosts: Record<GhostCamp, number>
}

export const fmtOdds = (odds: number, lang: 'fr' | 'en') => `×${odds.toFixed(1).replace('.', lang === 'fr' ? ',' : '.')}`
export const potentialPayout = (stake: number, odds: number) => Math.floor(stake * odds)
