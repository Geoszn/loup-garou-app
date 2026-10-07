import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePresence } from '../context/PresenceContext'
import { useLanguage } from '../i18n/LanguageContext'
import { useJoinPublicGame, type JoinTarget } from '../hooks/useJoinPublicGame'
import { JoinChoiceOverlay } from './JoinChoiceOverlay'
import { Avatar } from './Avatar'
import { Button } from './ui'
import { continentName } from '../lib/continents'
import { homeSection } from '../lib/homeBootstrap'
import type { GameStatus } from '../types/game'

// « Le village veille » : sur l'accueil, une maison par partie en cours —
// publique OU privée — pour montrer que le jeu est vivant (voir la migration
// 0213, get_live_games). Une partie privée n'est jamais rejoignable ici et ne
// révèle ni code, ni hôte, ni avatars : juste un cadenas, le nombre de joueurs
// et le continent. Paginé : 5 maisons par rangée, 2 rangées par page.
export const HOUSES_PER_ROW = 5
export const ROWS = 2
export const PAGE_SIZE = HOUSES_PER_ROW * ROWS
const MAX_LOBBY_PLAYERS = 20
const POLL_MS = 20000

export interface LiveGame {
  key: string
  game_id?: string
  code?: string
  is_public: boolean
  is_mine: boolean
  status: string
  night_number: number | null
  player_count: number
  continent: string | null
  host_name?: string
  host_avatar_icon?: string | null
  host_avatar_config?: unknown
  already_requested?: boolean
}

type Phase = 'lobby' | 'night' | 'day' | 'vote'
function phaseOf(status: string): Phase {
  if (status === 'lobby') return 'lobby'
  if (status === 'night' || status === 'role_reveal') return 'night'
  if (status === 'day_vote') return 'vote'
  return 'day'
}

const W = 360
const H = 300

interface Placed {
  game: LiveGame
  x: number
  y: number
  scale: number
}

/** Place les maisons d'une page : rangée du fond (plus petite, plus haute)
 * puis rangée du devant, chacune centrée. Les premières parties de la page
 * (celles qu'on peut rejoindre, voir le tri) vont devant. */
export function layoutPage(page: LiveGame[]): Placed[] {
  const front = page.slice(0, HOUSES_PER_ROW)
  const back = page.slice(HOUSES_PER_ROW, PAGE_SIZE)
  const xs = (n: number) => Array.from({ length: n }, (_, i) => W / 2 + (i - (n - 1) / 2) * 68)
  return [
    ...back.map((game, i) => ({ game, x: xs(back.length)[i], y: 190, scale: 0.72 })),
    ...front.map((game, i) => ({ game, x: xs(front.length)[i], y: 268, scale: 1 })),
  ]
}

/** Parties rejoignables d'abord, puis par nombre de joueurs. */
export function sortLive(games: LiveGame[]): LiveGame[] {
  const rank = (g: LiveGame) => (g.is_mine ? 0 : g.is_public && g.status === 'lobby' ? 1 : g.is_public ? 2 : 3)
  return [...games].sort((a, b) => rank(a) - rank(b) || b.player_count - a.player_count)
}

function House({ p, selected, label, onSelect }: { p: Placed; selected: boolean; label: string; onSelect: () => void }) {
  const g = p.game
  const phase = phaseOf(g.status)
  const inProgress = phase !== 'lobby'
  const size = p.scale * (0.9 + Math.min(g.player_count, 14) * 0.012)
  const wall = g.is_public ? '#2c2347' : '#1d1a30'
  return (
    <g
      transform={`translate(${p.x} ${p.y}) scale(${size})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      className="cursor-pointer outline-none"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <rect x="-30" y="-58" width="60" height="62" fill="transparent" />
      {selected && <ellipse cx="0" cy="2" rx="28" ry="5" fill="#e0a84a" opacity=".55" />}
      {g.is_public && <circle cx="0" cy="-16" r="28" fill={inProgress ? 'url(#vlRedGlow)' : 'url(#vlWinGlow)'} className="village-breathe" />}
      <rect x="-15" y="-27" width="30" height="27" fill={wall} stroke={selected ? '#e0a84a' : '#0a0817'} strokeWidth={selected ? 1.5 : 0.8} />
      <path d="M-19 -27 L0 -44 L19 -27Z" fill={g.is_public ? '#4d2c42' : '#262238'} stroke="#0a0817" strokeWidth=".8" />
      {g.is_public ? (
        <>
          <rect x="-10" y="-21" width="8" height="9" fill={inProgress ? '#ff7a5a' : '#ffcf6b'} />
          <rect x="2" y="-21" width="8" height="9" fill={inProgress ? '#ff7a5a' : '#ffcf6b'} />
          <rect x="-3.5" y="-12" width="7" height="12" fill="#150f22" />
          {inProgress && <circle cx="10" cy="-49" r="3" fill="#8a84a0" opacity=".5" className="village-smoke" />}
        </>
      ) : (
        <>
          <rect x="-10" y="-21" width="8" height="9" fill="#14111f" />
          <rect x="2" y="-21" width="8" height="9" fill="#14111f" />
          <path d="M-10 -19h8M-10 -16h8M2 -19h8M2 -16h8" stroke="#2c2742" strokeWidth=".8" />
          <rect x="-3.5" y="-12" width="7" height="12" fill="#0f0c18" />
          <g transform="translate(0 -35)">
            <rect x="-5" y="-1" width="10" height="8" rx="1.5" fill="#cfc9e0" />
            <path d="M-3 -1 v-3 a3 3 0 0 1 6 0 v3" fill="none" stroke="#cfc9e0" strokeWidth="1.4" />
          </g>
        </>
      )}
      {g.is_mine && <text x="0" y="-66" textAnchor="middle" fontSize="11">⭐</text>}
      <g transform={`translate(0 ${g.is_public ? -53 : -58})`}>
        <rect x="-12" y="-7" width="24" height="14" rx="7" fill="rgba(10,8,23,.9)" stroke={selected ? '#e0a84a' : 'rgba(255,255,255,.22)'} strokeWidth=".8" />
        <text textAnchor="middle" y="3" fontSize="9" fontWeight="700" fill="#f5e6c8">{g.player_count}</text>
      </g>
    </g>
  )
}

// memo : LiveVillage se re-rend à chaque changement de présence (n'importe quel
// joueur qui arrive ou part, voir usePresence) — sans ça, toute la scène SVG
// (~150 éléments animés) serait redessinée pour rien à chaque fois.
// `wide` (écran large) : la scène s'étire à 600 de large, le village reste centré
// (maisons, lune, loup) et le ciel, les collines, les arbres et les lucioles se
// prolongent de chaque côté — la carte prend alors toute la largeur de l'accueil
// sans devenir immense en hauteur.
const Scene = memo(function Scene({ placed, selectedKey, labels, onSelect, wide }: { placed: Placed[]; selectedKey: string | null; labels: Record<string, string>; onSelect: (key: string) => void; wide: boolean }) {
  const VW = wide ? 600 : W
  const dx = (VW - W) / 2
  const trees = [16, 60, 112, 168, 224, 276, 322, 348].flatMap((x) => [x - W, x, x + W]).filter((x) => x >= -dx - 14 && x <= W + dx)
  return (
    <svg viewBox={`0 0 ${VW} ${H}`} className="block w-full" role="group">
      <defs>
        <linearGradient id="vlSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070918" />
          <stop offset=".55" stopColor="#1a1535" />
          <stop offset="1" stopColor="#40253f" />
        </linearGradient>
        <radialGradient id="vlMoonGlow">
          <stop offset="0" stopColor="#fff2c8" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff2c8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vlWinGlow">
          <stop offset="0" stopColor="#ffcf6b" stopOpacity=".85" />
          <stop offset="1" stopColor="#ffcf6b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vlRedGlow">
          <stop offset="0" stopColor="#ff5a4a" stopOpacity=".75" />
          <stop offset="1" stopColor="#ff5a4a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={VW} height={H} fill="url(#vlSky)" />
      {Array.from({ length: wide ? 63 : 38 }).map((_, k) => (
        <circle key={k} cx={(k * 97) % VW} cy={(k * 53) % 130} r={k % 5 === 0 ? 1.1 : 0.6} fill="#fff" className="village-twinkle" style={{ animationDelay: `${(k % 7) * 0.4}s` }} />
      ))}
      <g transform={`translate(${dx} 0)`}>
      <circle cx="290" cy="62" r="66" fill="url(#vlMoonGlow)" />
      <circle cx="290" cy="62" r="21" fill="#fff4d2" />
      <circle cx="283" cy="56" r="3.6" fill="#f1dfae" opacity=".7" />
      <circle cx="297" cy="68" r="5.2" fill="#f1dfae" opacity=".55" />
      <circle cx="295" cy="52" r="2.4" fill="#f1dfae" opacity=".6" />
      <path d={`M${-dx} 158 L0 158 C50 128 100 146 150 134 S240 124 290 142 S345 132 360 138 L${W + dx} 138 V300 H${-dx}Z`} fill="#181430" />
      {/* loup qui hurle à la lune */}
      <g transform="translate(226 74) scale(.92)" fill="#0a0813" stroke="#0a0813" strokeLinejoin="round" strokeLinecap="round">
        <path d="M5 58 L5 46 C6 36 12 28 19 22 C24 17 27 12 30 8 L38 16 C35 22 33 28 32 34 C31 42 33 50 34 58 Z" />
        <ellipse cx="35" cy="8" rx="8" ry="4.6" transform="rotate(-52 35 8)" />
        <path d="M38 3 L50 -9 L52 -4 L43 7 Z" />
        <path d="M28 4 L27 -6 L34 0 Z" />
        <path d="M6 54 C-4 52 -9 44 -7 35" strokeWidth="5" fill="none" />
      </g>
      <path d={`M${-dx} 176 L0 176 C40 156 90 170 140 160 S230 152 280 164 S340 156 360 162 L${W + dx} 162 V300 H${-dx}Z`} fill="#110e22" />
      {trees.map((x, k) => (
        <path key={k} d={`M${x} 196 l7 -22 l7 22z M${x + 1} 184 l6 -18 l6 18z`} fill="#0a0817" />
      ))}
      <rect x={-dx} y="250" width={VW} height="50" fill="#0a0817" />
      {placed.map((p) => (
        <House key={p.game.key} p={p} selected={selectedKey === p.game.key} label={labels[p.game.key] ?? ''} onSelect={() => onSelect(p.game.key)} />
      ))}
      {Array.from({ length: wide ? 20 : 12 }).map((_, k) => (
        <circle key={k} cx={16 + k * 29 - dx} cy={258 + (k % 3) * 10} r="1.6" fill="#d8ff7a" className="village-fly" style={{ animationDelay: `${k * 0.6}s` }} />
      ))}
      </g>
    </svg>
  )
})

/** Écran large (≥ 640 px) : voir `Scene`. */
function useWideScreen(): boolean {
  const query = '(min-width: 640px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const onChange = () => setWide(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

export function LiveVillage() {
  const wide = useWideScreen()
  const { t, lang } = useLanguage()
  const { profile } = useAuth()
  const { onlineStatus } = usePresence()
  const navigate = useNavigate()
  const displayName = profile?.username ?? t('common.playerFallback')
  const join = useJoinPublicGame(displayName)
  const [games, setGames] = useState<LiveGame[] | null>(null)
  const [page, setPage] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return
    const { data, error } = await supabase.rpc('get_live_games')
    if (!error) setGames((data ?? []) as LiveGame[])
  }, [])

  useEffect(() => {
    // Première lecture : section du groupé de l'accueil (homeBootstrap.ts).
    void homeSection<LiveGame[]>('live_games', async () => {
      const { data, error } = await supabase.rpc('get_live_games')
      return error ? null : ((data ?? []) as LiveGame[])
    }).then((data) => {
      if (data) setGames(data)
    })
    const id = setInterval(load, POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const sorted = useMemo(() => sortLive(games ?? []), [games])
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageGames = useMemo(() => sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE), [sorted, safePage])
  const placed = useMemo(() => layoutPage(pageGames), [pageGames])
  const selected = pageGames.find((g) => g.key === selectedKey) ?? pageGames[0] ?? null

  const online = Object.keys(onlineStatus).length
  const playersInGames = sorted.reduce((sum, g) => sum + g.player_count, 0)

  function statusLabel(g: LiveGame): string {
    switch (phaseOf(g.status)) {
      case 'lobby':
        return t('village.status.lobby')
      case 'night':
        return t('village.status.night', { n: Math.max(g.night_number ?? 1, 1) })
      case 'vote':
        return t('village.status.vote')
      default:
        return t('village.status.day')
    }
  }
  const continentLabel = (g: LiveGame) => continentName(g.continent, lang) ?? t('village.unknownContinent')
  const titleOf = (g: LiveGame) => (g.is_public ? t('village.gameOf', { name: g.host_name ?? '?' }) : t('village.private'))
  const labels = useMemo(
    () => Object.fromEntries(pageGames.map((g) => [g.key, `${titleOf(g)}, ${statusLabel(g)}, ${continentLabel(g)}, ${t('village.players', { count: g.player_count })}`])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageGames, lang]
  )

  if (games === null) return <div className="h-64 animate-pulse rounded-3xl border border-white/10 bg-night-900/60" />

  const phase = selected ? phaseOf(selected.status) : null
  const joinable = !!selected && selected.is_public && !selected.is_mine && phase === 'lobby' && selected.player_count < MAX_LOBBY_PLAYERS
  const full = !!selected && selected.is_public && !selected.is_mine && phase === 'lobby' && selected.player_count >= MAX_LOBBY_PLAYERS

  return (
    <section className="flex flex-col gap-2.5" aria-label={t('village.title')}>
      <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0b0d1a]">
        <div className="absolute left-4 top-4 z-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-moon-300/80">{t('village.eyebrow')}</p>
          <p className="font-display text-lg leading-tight text-moon-200">{t('village.title')}</p>
        </div>
        {online > 0 && (
          <span className="absolute right-3 top-4 z-10 flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            {t('village.online', { count: online })}
          </span>
        )}

        <Scene placed={placed} selectedKey={selected?.key ?? null} labels={labels} onSelect={setSelectedKey} wide={wide} />

        {sorted.length === 0 && (
          <div className="absolute inset-x-0 bottom-[18%] z-10 flex flex-col items-center gap-2 px-6 text-center">
            <p className="text-sm text-moon-200/85">{t('village.empty')}</p>
            <Link to="/jouer" className="rounded-xl bg-gradient-to-b from-blood-500 to-blood-700 px-4 py-2 text-xs font-semibold text-[#fdf6e3] shadow-blood-btn">
              {t('village.create')}
            </Link>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/5 bg-black/20 px-3 py-2 text-[10px] text-moon-200/60">
          <span>🟡 {t('village.legendOpen')}</span>
          <span>🔴 {t('village.legendLive')}</span>
          <span>🔒 {t('village.legendPrivate')}</span>
          {sorted.length > 0 && (
            <span className="text-moon-200/40">
              · {t('village.gamesCount', { count: sorted.length, s: sorted.length > 1 ? 's' : '' })} · {t('village.playersInGames', { count: playersInGames, s: playersInGames > 1 ? 's' : '' })}
            </span>
          )}
        </div>
      </div>

      {pageCount > 1 && (
        <div className="mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            aria-label={t('village.prev')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-night-600/60 bg-night-900/60 text-moon-200 transition-colors hover:border-moon-400/40 disabled:opacity-30"
          >
            ‹
          </button>
          <div className="flex items-center gap-1.5" aria-label={t('village.page', { page: safePage + 1, total: pageCount })}>
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                aria-label={t('village.page', { page: i + 1, total: pageCount })}
                aria-current={i === safePage}
                className={`h-2 rounded-full transition-all ${i === safePage ? 'w-5 bg-moon-300' : 'w-2 bg-night-500 hover:bg-night-400'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            aria-label={t('village.next')}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-night-600/60 bg-night-900/60 text-moon-200 transition-colors hover:border-moon-400/40 disabled:opacity-30"
          >
            ›
          </button>
          <span className="text-[11px] tabular-nums text-moon-200/45">{t('village.page', { page: safePage + 1, total: pageCount })}</span>
        </div>
      )}

      {selected && (
        <div className="flex w-full items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/60 px-3 py-2.5">
          {selected.is_public ? (
            <Avatar config={selected.host_avatar_config} icon={selected.host_avatar_icon} name={selected.host_name} className="h-11 w-11 shrink-0" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night-700 text-xl">🔒</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-moon-200">
              {selected.is_mine ? `⭐ ${t('village.mine')}` : titleOf(selected)}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-moon-200/55">
              <span className="rounded-full bg-night-700/80 px-1.5 py-0.5 font-semibold text-moon-200/80">{statusLabel(selected)}</span>
              <span>{continentLabel(selected)}</span>
              <span>·</span>
              <span className="tabular-nums">
                {phase === 'lobby' && selected.is_public ? `${selected.player_count}/${MAX_LOBBY_PLAYERS}` : t('village.players', { count: selected.player_count })}
              </span>
            </p>
            {!selected.is_public && !selected.is_mine && <p className="mt-0.5 text-[11px] text-moon-200/45">{t('village.privateNote')}</p>}
          </div>
          {selected.is_mine && selected.code && (
            <Button className="shrink-0 px-3 py-1.5 text-xs" onClick={() => navigate(selected.status === 'lobby' ? `/partie/${selected.code}/lobby` : `/partie/${selected.code}`)}>
              {t('village.resume')}
            </Button>
          )}
          {!selected.is_mine && selected.is_public && selected.game_id && selected.code && (
            <Button
              className="shrink-0 px-3 py-1.5 text-xs"
              variant={joinable ? 'primary' : 'ghost'}
              disabled={full || selected.already_requested || join.requestingId === selected.game_id}
              onClick={() => join.requestJoin({ game_id: selected.game_id!, code: selected.code!, status: selected.status as GameStatus } satisfies JoinTarget)}
            >
              {selected.already_requested ? t('village.requested') : full ? t('village.full') : joinable ? t('village.join') : t('village.watch')}
            </Button>
          )}
        </div>
      )}
      {join.error && <p className="w-full text-xs text-blood-400">{join.error}</p>}
      <JoinChoiceOverlay join={join} />
    </section>
  )
}
