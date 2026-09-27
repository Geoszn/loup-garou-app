import { useLanguage } from '../i18n/LanguageContext'
import { pointsToNextTier, tierForPoints } from '../lib/ranks'

/** Barre de progression vers le prochain rang de prestige. */
export function RankProgress({ points }: { points: number }) {
  const { t } = useLanguage()
  const tier = tierForPoints(points)
  const next = pointsToNextTier(points)
  const pct = next ? Math.min(100, Math.max(0, Math.round(((points - tier.minPoints) / (next.next.minPoints - tier.minPoints)) * 100))) : 100
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[11px] text-moon-200/60">
        <span>{points} pts</span>
        <span>{next ? t('home.nextRank', { points: next.remaining }) : t('home.maxRank')}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-night-800">
        <div className="h-full rounded-full bg-gradient-to-r from-moon-300 to-moon-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
