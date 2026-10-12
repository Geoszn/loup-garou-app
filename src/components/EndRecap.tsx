import { useEffect, useState, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import type { MyGameResult, PublicPlayer } from '../types/game'
import { ROLES, roleLabel, type RoleId } from '../lib/roles'
import { pointsToNextTier, tierForPoints, tierGroup, tierLabel, type RankTier } from '../lib/ranks'
import { AVATAR_ICON_MIN_POINTS } from '../lib/avatars'
import { Avatar } from './Avatar'
import { RankTierBadge } from './RankTierBadge'
import { impactLabel } from './DeathImpactModal'

// Briques de l'écran de fin de partie (EndScreen, GameRoom.tsx) : en-tête de résultat, carte de rang avec la
// progression vers le prochain palier, détail des points, rôles révélés, et un bloc repliable.

/** Paliers dont le GROUPE donne un cadre d'avatar (voir tierRingClass, PlayerGrid.tsx et TierUpModal.tsx). */
const FRAME_TIER_GROUPS = new Set(['chasseur', 'ancien', 'sage', 'legende'])

/** Grande carte du résultat : victoire/défaite personnelle (si on a un résultat), camp vainqueur, explication, rôle joué. */
export function EndHero({
  won,
  title,
  explanation,
  myRole,
  survivalPercent,
}: {
  /** null = pas de résultat personnel (ex. observateur) : seul le camp vainqueur est affiché. */
  won: boolean | null
  title: string
  explanation: string
  myRole: string | null
  survivalPercent: number | null
}) {
  const { t } = useLanguage()
  const role = myRole ? ROLES[myRole as RoleId] : null
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border px-5 py-7 text-center ${
        won === false ? 'border-night-600/60 bg-gradient-to-b from-night-700/50 to-transparent' : 'border-moon-400/50 bg-gradient-to-b from-moon-400/25 via-moon-400/5 to-transparent'
      }`}
    >
      {won !== null && (
        <>
          <div className="text-6xl drop-shadow-[0_0_18px_rgba(224,168,74,0.55)]" aria-hidden="true">
            {won ? '🏆' : '🕯️'}
          </div>
          <p className={`mt-2 font-display text-4xl tracking-wide ${won ? 'text-moon-300' : 'text-moon-200/80'}`}>{won ? t('game.endYouWon') : t('game.endYouLost')}</p>
        </>
      )}
      <p className={`${won === null ? 'font-display text-2xl' : 'mt-1 text-sm font-semibold'} text-moon-200`}>{title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-xs text-moon-200/55">{explanation}</p>
      {role && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-night-900/50 px-3 py-1 text-xs text-moon-200/80">
          {role.emoji} {t('game.endYourRole', { role: roleLabel(myRole, t) })}
          {survivalPercent !== null && <> · {t('game.endSurvivalChip', { percent: survivalPercent })}</>}
        </p>
      )}
    </div>
  )
}

/** Ce que le prochain palier débloque (cadre d'avatar, icônes), ou rien si ce palier ne change rien de tangible. */
function nextUnlocks(points: number, t: ReturnType<typeof useLanguage>['t']): string | null {
  const next = pointsToNextTier(points)
  if (!next) return null
  const parts: string[] = []
  if (tierGroup(next.next.id) !== tierGroup(tierForPoints(points).id) && FRAME_TIER_GROUPS.has(tierGroup(next.next.id))) {
    parts.push(t('game.endUnlockFrame'))
  }
  const icons = (Object.entries(AVATAR_ICON_MIN_POINTS) as [string, number][]).filter(([, min]) => min > points && min <= next.next.minPoints).map(([icon]) => icon)
  if (icons.length > 0) parts.push(t('game.endUnlockIcons', { count: icons.length, list: icons.join(' ') }))
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Mon rang à la fin de la partie : badge, points, variation, barre animée vers le prochain palier et ce qu'il débloque.
 * `points` suit le total réel (le coffre de fin peut l'augmenter après coup) ; `previousPoints` est le total d'avant la partie. */
export function EndRankCard({ points, previousPoints }: { points: number; previousPoints: number }) {
  const { t, lang } = useLanguage()
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setAnimate(true), 350)
    return () => window.clearTimeout(id)
  }, [])

  const gained = points - previousPoints
  const tier = tierForPoints(points)
  const prevTier = tierForPoints(previousPoints)
  const tierChanged = tier.id !== prevTier.id
  const next = pointsToNextTier(points)
  const span = next ? next.next.minPoints - tier.minPoints : 1
  const pctOf = (p: number) => (next ? Math.min(100, Math.max(0, ((p - tier.minPoints) / span) * 100)) : 100)
  // Changement de palier : la barre repart de zéro dans le nouveau palier, sans afficher l'ancien niveau en dehors.
  const startPct = tierChanged ? 0 : pctOf(previousPoints)
  const endPct = pctOf(points)
  const low = Math.min(startPct, endPct)
  const games = gained > 0 && next ? Math.ceil(next.remaining / gained) : null
  const unlocks = nextUnlocks(points, t)

  return (
    <div className="rounded-3xl border border-moon-400/30 bg-gradient-to-b from-night-700/60 to-night-900/60 p-4 text-left shadow-card">
      {tierChanged && (
        <div className="mb-3 flex flex-wrap items-center justify-center gap-x-2 rounded-xl bg-moon-400/20 px-3 py-2 text-center text-sm font-bold text-moon-300">
          {t('game.myResultTierUp')}
          <span className="text-xs font-semibold text-moon-200/70">
            {tierLabel(prevTier.id, t)} → {tierLabel(tier.id, t)}
          </span>
        </div>
      )}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-moon-400/30 blur-xl" aria-hidden="true" />
          <RankTierBadge tier={tier.id as RankTier} size={68} className="relative" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-moon-200/45">{t('game.endRankLabel')}</p>
          <p className="truncate font-display text-2xl text-moon-200">{tierLabel(tier.id, t)}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-moon-200/70">
            <span className="tabular-nums">{t('game.endRankPoints', { points: points.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US') })}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${gained >= 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-blood-500/15 text-blood-400'}`}>
              {gained >= 0 ? '+' : ''}
              {gained}
            </span>
          </p>
        </div>
      </div>

      {next ? (
        <div className="mt-4">
          <div className="relative h-3.5 overflow-hidden rounded-full bg-night-800">
            <div className="absolute inset-y-0 left-0 rounded-full bg-moon-300/55 transition-all duration-1000 ease-out" style={{ width: `${animate ? low : startPct}%` }} />
            <div
              className={`absolute inset-y-0 rounded-full transition-all duration-1000 ease-out ${gained >= 0 ? 'bg-gradient-to-r from-moon-300 to-moon-400 shadow-[0_0_12px_rgba(224,168,74,0.7)]' : 'bg-blood-500/70'}`}
              style={{ left: `${low}%`, width: animate ? `${Math.abs(endPct - startPct)}%` : '0%' }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-moon-200/55">
            <span>{tierLabel(tier.id, t)}</span>
            <span className="flex items-center gap-1.5 font-semibold text-moon-200/80">
              <RankTierBadge tier={next.next.id as RankTier} size={16} /> {tierLabel(next.next.id, t)}
            </span>
          </div>
          <p className="mt-2 text-center text-sm text-moon-200/80">
            {t('game.endNextTier', { points: next.remaining, tier: tierLabel(next.next.id, t) })}
            {games !== null && <span className="text-moon-200/50"> · {t(games > 1 ? 'game.endNextGamesMany' : 'game.endNextGamesOne', { count: games })}</span>}
          </p>
          {unlocks && <p className="mt-1.5 text-center text-[11px] text-moon-200/55">{t('game.endUnlocks', { what: unlocks })}</p>}
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-moon-300">{t('game.endMaxRank')}</p>
      )}
    </div>
  )
}

/** Détail des points de la partie (résultat, bonus d'impact, total) et XP de saison. */
export function EndPoints({ result }: { result: MyGameResult }) {
  const { t } = useLanguage()
  const outcome = result.points_gained - result.impact_bonus
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-moon-200/70">
          {t('game.myResultOutcome')} <span className="text-xs text-moon-200/40">{t('game.myResultOutcomeSurvival', { percent: String(Math.round(result.participation_ratio * 100)) })}</span>
        </span>
        <span className={`font-display font-semibold ${outcome >= 0 ? 'text-emerald-300' : 'text-blood-400'}`}>
          {outcome >= 0 ? '+' : ''}
          {outcome}
        </span>
      </div>
      {result.impact_details.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-night-700/50 pt-2">
          {result.impact_details.map((d, i) => (
            <div key={`${d.kind}-${i}`} className="flex items-center justify-between text-xs">
              <span className="text-moon-200/60">{impactLabel(d, t)}</span>
              <span className="font-semibold text-emerald-300">+{d.points}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-night-700/50 pt-2">
        <span className="font-semibold text-moon-200/80">{t('game.myResultTotal')}</span>
        <span className={`font-display font-bold ${result.points_gained >= 0 ? 'text-emerald-300' : 'text-blood-400'}`}>
          {result.points_gained >= 0 ? '+' : ''}
          {result.points_gained}
        </span>
      </div>
      {/* XP de saison de cette partie (voir migration 0203) : compteur séparé des points de rang, jamais mélangé. */}
      {!!result.season_xp_gained && (
        <div className="mt-1 flex items-center justify-between rounded-xl border border-pink-400/30 bg-pink-400/10 px-3 py-2.5">
          <span className="text-sm font-semibold text-pink-300">{t('game.myResultSeasonXp')}</span>
          <span className="font-display font-bold text-pink-300">+{result.season_xp_gained} XP</span>
        </div>
      )}
    </div>
  )
}

/** Rôles révélés : un visage par joueur avec son rôle ; les gagnants sont couronnés, moi je suis entouré. */
export function EndRoles({
  reveal,
  players,
  selfId,
  isWinner,
}: {
  reveal: { user_id: string; role: string }[]
  players: PublicPlayer[]
  selfId: string
  isWinner: (userId: string, role: string) => boolean
}) {
  const { t } = useLanguage()
  return (
    <div className="grid grid-cols-3 gap-2">
      {reveal.map((r) => {
        const p = players.find((pl) => pl.user_id === r.user_id)
        if (!p) return null
        const won = isWinner(r.user_id, r.role)
        const mine = r.user_id === selfId
        return (
          <div
            key={r.user_id}
            className={`relative flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-center text-xs ${
              won ? 'border-moon-400/50 bg-moon-400/10' : 'border-night-600/60 bg-night-900/50 opacity-70'
            } ${mine ? 'ring-2 ring-moon-400/70' : ''}`}
          >
            {won && <span className="absolute -right-1.5 -top-1.5 text-sm">👑</span>}
            <div className="relative">
              <Avatar config={p.avatar_config} icon={p.avatar_icon} color={p.avatar_color} name={p.display_name} className={`h-11 w-11 rounded-full ${p.is_alive ? '' : 'grayscale'}`} />
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-night-900 text-sm ring-1 ring-night-600">{ROLES[r.role as RoleId]?.emoji}</span>
            </div>
            <p className="w-full truncate font-semibold text-moon-200/90">{mine ? t('dayLayout.me') : p.display_name}</p>
            <p className="w-full truncate text-[10px] text-moon-200/50">{roleLabel(r.role, t)}</p>
          </div>
        )
      })}
    </div>
  )
}

/** Bloc repliable de l'écran de fin. */
export function RecapFold({ title, open: initiallyOpen = false, children }: { title: TranslationKey; open?: boolean; children: ReactNode }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <div className="rounded-2xl border border-night-600/60 bg-night-900/40 text-left">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-xs font-bold uppercase tracking-widest text-moon-200/55">{t(title)}</span>
        <span className="text-xs text-moon-200/40">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}
