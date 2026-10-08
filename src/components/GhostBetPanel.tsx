import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import type { PublicPlayer } from '../types/game'
import { fmtOdds, GHOST_STAKES, potentialPayout, type GhostBetRow, type GhostBetState, type GhostCamp } from '../lib/ghostBet'
import { Avatar } from './Avatar'
import { LoupCoinIcon } from './LoupCoinIcon'
import { ErrorText } from './ui'

const CAMPS: { id: GhostCamp; icon: string; tone: string }[] = [
  { id: 'village', icon: '🏘️', tone: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200' },
  { id: 'loups', icon: '🐺', tone: 'border-blood-500/60 bg-blood-600/15 text-blood-300' },
  { id: 'autre', icon: '✨', tone: 'border-amber-400/50 bg-amber-400/10 text-amber-200' },
]

const ghostCard = 'overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-b from-indigo-950/70 to-night-950/80'
const cta =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all active:scale-[0.97] disabled:opacity-40'
const chipBase = 'flex-1 rounded-lg border py-1.5 text-center text-xs font-semibold tabular-nums transition-colors disabled:opacity-35'

/**
 * « Pronostic des fantômes » (migration 0221) : un bloc FACULTATIF, replié par
 * défaut, dans l'écran d'un joueur éliminé. Il peut miser quelques Loup Coins
 * sur le camp gagnant et/ou sur un survivant ; le serveur calcule les cotes,
 * retient la mise et règle tout seul à la fin de la partie. Aucun rappel, aucune
 * notification : on peut l'ignorer sans conséquence. Le bloc disparaît quand les
 * pronostics sont impossibles (partie avec bots, trop peu d'humains…).
 */
export function GhostBetPanel({ gameId, players }: { gameId: string; players: PublicPlayer[] }) {
  const { t, lang } = useLanguage()
  const { refreshProfile } = useAuth()
  const [state, setState] = useState<GhostBetState | null>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'camp' | 'survivor'>('camp')
  const [camp, setCamp] = useState<GhostCamp>('loups')
  const [target, setTarget] = useState<string | null>(null)
  const [stake, setStake] = useState<number>(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aliveCount = players.filter((p) => p.is_alive).length
  const loadRef = useRef<() => void>(() => {})

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_ghost_bet_state', { p_game_id: gameId })
    // Fonction pas encore en base ou erreur : le bloc reste simplement caché.
    if (!rpcError && data) setState(data as GhostBetState)
  }, [gameId])
  loadRef.current = () => void load()

  // Une lecture à l'arrivée (pour savoir si le bloc doit exister), puis seulement
  // quand le joueur l'ouvre ou que le nombre de survivants change.
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => loadRef.current(), 600)
    return () => clearTimeout(timer)
  }, [open, aliveCount])
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadRef.current()
    }, 25000)
    return () => clearInterval(id)
  }, [open])

  const survivors = useMemo(() => players.filter((p) => p.is_alive), [players])
  const bet = (kind: 'camp' | 'survivor'): GhostBetRow | undefined => state?.my_bets.find((b) => b.kind === kind)
  const campName = (c: string) => t(`gb.camp.${c}` as TranslationKey)
  const playerName = (id: string) => players.find((p) => p.user_id === id)?.display_name ?? '?'

  if (!state) return null
  const hasBets = state.my_bets.length > 0
  if (!state.can_bet && !hasBets && state.reason !== 'decided' && state.reason !== 'daily_cap') return null

  async function place(kind: 'camp' | 'survivor', pick: string) {
    setBusy(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('place_ghost_bet', { p_game_id: gameId, p_kind: kind, p_pick: pick, p_stake: stake })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      void load()
      return
    }
    setState(data as GhostBetState)
    void refreshProfile()
  }

  const closedNote = !state.can_bet && state.reason ? (state.reason === 'daily_cap' ? t('gb.closed.daily') : state.reason === 'decided' ? t('gb.closed.decided') : null) : null
  const stakeRow = (
    <div>
      <p className="mb-1.5 flex items-center justify-between text-[11px] text-moon-200/50">
        <span>{t('gb.stake')}</span>
        <span className="flex items-center gap-1">
          {t('gb.balance', { n: state.balance })} <LoupCoinIcon className="h-3 w-3" />
        </span>
      </p>
      <div className="flex gap-1.5">
        {GHOST_STAKES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={s > state.balance}
            onClick={() => setStake(s)}
            className={`${chipBase} ${stake === s ? 'border-amber-400/70 bg-amber-400/15 text-amber-200' : 'border-night-600/60 bg-night-900/50 text-moon-200/70'}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
  const summary = (what: string, odds: number) => (
    <div className="flex items-center justify-between rounded-xl bg-night-900/60 px-3 py-2 text-xs text-moon-200/70">
      <span>{what}</span>
      <span className="flex items-center gap-1 font-semibold text-amber-300">
        +{potentialPayout(stake, odds) - stake} <LoupCoinIcon className="h-3.5 w-3.5" />
        <span className="font-normal text-moon-200/40">{t('gb.receive', { n: potentialPayout(stake, odds) })}</span>
      </span>
    </div>
  )
  const placedCard = (b: GhostBetRow) => (
    <div className="mx-3 mt-3 rounded-xl border border-violet-300/30 bg-violet-400/10 px-3 py-2.5 text-left">
      <p className="text-sm font-semibold text-violet-100">
        {b.kind === 'camp' ? t('gb.placed.camp', { what: campName(b.pick), odds: fmtOdds(b.odds, lang) }) : t('gb.placed.survivor', { name: playerName(b.pick), odds: fmtOdds(b.odds, lang) })}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-moon-200/55">
        {t('gb.placed.detail', { stake: b.stake, win: potentialPayout(b.stake, b.odds) })} <LoupCoinIcon className="h-3 w-3" /> · {t('gb.pending')}
      </p>
    </div>
  )

  return (
    <div className={ghostCard}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-lg ring-1 ring-violet-300/30">🔮</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm leading-tight text-moon-200">{t('gb.title')}</span>
          <span className="block truncate text-[11px] text-violet-200/60">{open ? t('gb.subtitle') : t('gb.ask')}</span>
        </span>
        <span className="shrink-0 rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
          {hasBets ? t('gb.inProgress', { n: state.my_bets.length }) : t('gb.optional')}
        </span>
        <span className={`text-moon-200/40 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>

      {open && (
        <div className="pb-3">
          <div className="flex gap-1 px-3">
            {(['camp', 'survivor'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold ${tab === k ? 'bg-violet-500/80 text-white' : 'bg-night-800/70 text-moon-200/50'}`}
              >
                {t(`gb.tab.${k}` as TranslationKey)}
              </button>
            ))}
          </div>

          {bet(tab) ? (
            placedCard(bet(tab) as GhostBetRow)
          ) : !state.can_bet ? (
            <p className="mx-3 mt-3 rounded-xl bg-night-900/60 px-3 py-2.5 text-xs text-moon-200/60">{closedNote}</p>
          ) : tab === 'camp' ? (
            <div className="flex flex-col gap-3 px-3 pt-3">
              <div className="grid grid-cols-3 gap-2">
                {CAMPS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCamp(c.id)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-1 py-2.5 ${camp === c.id ? c.tone : 'border-night-600/60 bg-night-900/50 text-moon-200/70'}`}
                  >
                    <span className="text-xl">{c.icon}</span>
                    <span className="text-xs font-semibold">{campName(c.id)}</span>
                    <span className="font-display text-lg leading-none tabular-nums">{fmtOdds(state.market.odds[c.id], lang)}</span>
                    <span className="text-[10px] opacity-60">{t('gb.ghosts', { n: state.ghosts[c.id] })}</span>
                  </button>
                ))}
              </div>
              {camp === 'autre' && <p className="-mt-1 text-center text-[10.5px] text-moon-200/45">{t('gb.camp.otherHint')}</p>}
              {stakeRow}
              {summary(t('gb.ifWins', { what: campName(camp) }), state.market.odds[camp])}
              <button type="button" disabled={busy} onClick={() => place('camp', camp)} className={cta}>
                {t('gb.validate')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-3 pt-3">
              <p className="text-left text-[11px] text-moon-200/55">{t('gb.survivor.hint', { odds: fmtOdds(state.market.survivor_odds, lang) })}</p>
              <div className="grid grid-cols-3 gap-2">
                {survivors.map((p) => (
                  <button
                    key={p.user_id}
                    type="button"
                    onClick={() => setTarget(p.user_id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2 ${target === p.user_id ? 'border-violet-300/80 bg-violet-400/15' : 'border-night-600/60 bg-night-900/50'}`}
                  >
                    <Avatar config={p.avatar_config} icon={p.avatar_icon} name={p.display_name} className="h-12 w-12" />
                    <span className="w-full truncate text-[11px] font-semibold text-moon-200">{p.display_name}</span>
                  </button>
                ))}
              </div>
              {stakeRow}
              {target && summary(t('gb.survivor.pick', { name: playerName(target) }), state.market.survivor_odds)}
              <button type="button" disabled={busy || !target} onClick={() => target && place('survivor', target)} className={cta}>
                {t('gb.validate')}
              </button>
            </div>
          )}

          {state.can_bet && !bet(tab) && <p className="px-3 pt-2 text-center text-[10.5px] leading-snug text-moon-200/40">{t('gb.foot')}</p>}
          <div className="px-3">
            <ErrorText>{error}</ErrorText>
          </div>
        </div>
      )}
    </div>
  )
}

/** Résultat des pronostics, en fin de partie (après le règlement automatique du
 * serveur). N'affiche rien si le joueur n'a rien pronostiqué. */
export function GhostBetResult({ gameId, enabled, players }: { gameId: string; enabled: boolean; players: PublicPlayer[] }) {
  const { t, lang } = useLanguage()
  const { refreshProfile } = useAuth()
  const [bets, setBets] = useState<GhostBetRow[] | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    supabase.rpc('get_ghost_bet_state', { p_game_id: gameId }).then(({ data, error }) => {
      if (!active || error || !data) return
      const rows = (data as GhostBetState).my_bets.filter((b) => b.result)
      setBets(rows)
      if (rows.some((b) => b.result === 'won' || b.result === 'refunded')) void refreshProfile()
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gameId])

  if (!bets || bets.length === 0) return null
  const net = bets.reduce((sum, b) => (b.result === 'refunded' ? sum : sum + b.payout - b.stake), 0)
  const label = (b: GhostBetRow) =>
    b.kind === 'camp'
      ? `${t('gb.tab.camp')} : ${t(`gb.camp.${b.pick}` as TranslationKey)} ${fmtOdds(b.odds, lang)}`
      : `${t('gb.tab.survivor')} : ${players.find((p) => p.user_id === b.pick)?.display_name ?? '?'} ${fmtOdds(b.odds, lang)}`

  return (
    <div className="mx-auto mb-5 max-w-sm animate-fade-in rounded-2xl border border-violet-400/30 bg-gradient-to-b from-indigo-950/60 to-night-900/50 p-4 text-left">
      <p className="mb-3 flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-violet-200/70">
        <span aria-hidden="true">🔮</span> {t('gb.result.title')}
      </p>
      <div className="flex flex-col gap-1.5 text-sm">
        {bets.map((b) => (
          <div key={b.kind} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-moon-200/75">{label(b)}</span>
            <span className={`shrink-0 font-display font-semibold ${b.result === 'won' ? 'text-emerald-300' : b.result === 'lost' ? 'text-blood-400' : 'text-moon-200/50'}`}>
              {b.result === 'won' ? `+${b.payout - b.stake}` : b.result === 'lost' ? `−${b.stake}` : t('gb.result.refunded')}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-night-600/50 pt-2.5">
        <span className="text-xs text-moon-200/55">{t('gb.result.net')}</span>
        <span className={`flex items-center gap-1 font-display text-lg font-bold ${net > 0 ? 'text-emerald-300' : net < 0 ? 'text-blood-400' : 'text-moon-200/60'}`}>
          {net > 0 ? '+' : net < 0 ? '−' : ''}
          {Math.abs(net)} <LoupCoinIcon className="h-4 w-4" />
        </span>
      </div>
    </div>
  )
}
