import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'

interface StreakResult {
  streak: number
  best: number
  is_new_day: boolean
}

const AUTO_HIDE_MS = 7000

/**
 * Bandeau "verre dépoli" affiché une fois par jour au premier chargement du
 * tableau de bord, annonçant la série de connexion (migration 0110 —
 * distincte de current_streak, qui compte les VICTOIRES d'affilée).
 * claim_daily_login() est idempotente : si le joueur a déjà rechargé la
 * page aujourd'hui, is_new_day revient à false et ce composant reste
 * silencieux. refreshProfile() fait suivre le nouveau login_streak jusqu'au
 * badge d'en-tête permanent (LoginStreakBadge).
 */
export function DailyLoginBanner() {
  const { user, refreshProfile } = useAuth()
  const { t } = useLanguage()
  const [result, setResult] = useState<StreakResult | null>(null)
  const claimed = useRef(false)

  useEffect(() => {
    if (!user || claimed.current) return
    claimed.current = true
    supabase
      .rpc('claim_daily_login')
      .then(({ data, error }) => {
        if (error || !data) return
        const r = data as StreakResult
        if (r.is_new_day) {
          setResult(r)
          refreshProfile()
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [result])

  if (!result) return null

  // Un palier = record personnel (au moins 3 jours, sinon "record" à 1 ou 2
  // jours n'a pas de sens) : accent rouge (comme les records de victoires)
  // plutôt que le doré par défaut, pour signaler que celui-ci sort du lot.
  const isMilestone = result.streak >= 3 && result.streak === result.best
  const isFirstDay = result.streak === 1

  const headline = isMilestone
    ? t('dailyStreak.milestoneHeadline', { count: result.streak })
    : isFirstDay
      ? t('dailyStreak.newHeadline')
      : t('dailyStreak.headline')
  const sub = isMilestone
    ? t('dailyStreak.milestoneSub')
    : isFirstDay
      ? t('dailyStreak.newSub')
      : t('dailyStreak.sub')

  return (
    <button
      type="button"
      onClick={() => setResult(null)}
      className={`relative mb-4 flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-left backdrop-blur-xl transition-opacity ${
        isMilestone ? 'border-blood-400/35 bg-blood-500/10' : 'border-moon-400/25 bg-moon-400/10'
      }`}
    >
      <span className="shrink-0 text-xl" aria-hidden="true">
        {isMilestone ? '🔥' : '📅'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] font-bold ${isMilestone ? 'text-blood-400' : 'text-moon-200'}`}>{headline}</p>
        <p className="text-xs text-moon-200/65">{sub}</p>
      </div>
      <div
        className={`flex shrink-0 flex-col items-center rounded-xl border bg-night-950/35 px-3 py-1.5 ${
          isMilestone ? 'border-blood-400/40' : 'border-moon-400/30'
        }`}
      >
        <span
          className={`font-display text-lg font-bold leading-none ${isMilestone ? 'text-blood-400' : 'text-moon-300'}`}
        >
          {result.streak}
        </span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wide text-moon-200/55">{t('dailyStreak.days')}</span>
      </div>
    </button>
  )
}
