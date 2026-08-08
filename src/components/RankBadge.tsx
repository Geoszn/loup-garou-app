import { Link } from 'react-router-dom'
import { tierForPoints, tierLabel } from '../lib/ranks'
import { RankTierBadge } from './RankTierBadge'
import { useLanguage } from '../i18n/LanguageContext'

/** Petit badge de rang (icône du palier + points), cliquable vers la page
 * Statistiques. Affiché dans l'en-tête du tableau de bord, à côté du menu
 * compte — reste discret (pas de compteur agressif) mais donne un rappel
 * permanent de la progression, y compris la série en cours si elle est
 * assez longue pour valoir la peine d'être montrée (≥ 2, sinon ça ferait
 * juste du bruit visuel pour une seule victoire). */
export function RankBadge({ points, streak }: { points: number; streak: number }) {
  const { t } = useLanguage()
  const tier = tierForPoints(points)

  return (
    <Link
      to="/stats"
      title={tierLabel(tier.id, t)}
      className="flex shrink-0 items-center gap-1 rounded-full border border-night-600 bg-night-800/60 py-1 px-2 text-xs text-moon-200/80 transition-colors hover:border-moon-400/50 hover:text-moon-200 sm:gap-1.5 sm:py-1.5 sm:px-3 sm:text-sm"
    >
      <RankTierBadge tier={tier.id} size={16} />
      <span className="font-semibold text-moon-200">{points}</span>
      {streak >= 2 && (
        <span className="flex items-center gap-0.5 text-xs text-blood-400">
          🔥{streak}
        </span>
      )}
    </Link>
  )
}
