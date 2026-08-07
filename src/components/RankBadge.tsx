import { Link } from 'react-router-dom'
import { tierInfo, tierLabel } from '../lib/ranks'
import { useLanguage } from '../i18n/LanguageContext'

/** Petit badge de rang (émoji du palier + points), cliquable vers la page
 * Statistiques. Affiché dans l'en-tête du tableau de bord, à côté du menu
 * compte — reste discret (pas de compteur agressif) mais donne un rappel
 * permanent de la progression, y compris la série en cours si elle est
 * assez longue pour valoir la peine d'être montrée (≥ 2, sinon ça ferait
 * juste du bruit visuel pour une seule victoire). */
export function RankBadge({ points, streak }: { points: number; streak: number }) {
  const { t } = useLanguage()
  const tier = tierInfo(pointsToTierLookup(points))

  return (
    <Link
      to="/stats"
      title={tierLabel(tier.id, t)}
      className="flex items-center gap-1.5 rounded-full border border-night-600 bg-night-800/60 py-1.5 px-3 text-sm text-moon-200/80 transition-colors hover:border-moon-400/50 hover:text-moon-200"
    >
      <span>{tier.emoji}</span>
      <span className="font-semibold text-moon-200">{points}</span>
      {streak >= 2 && (
        <span className="flex items-center gap-0.5 text-xs text-blood-400">
          🔥{streak}
        </span>
      )}
    </Link>
  )
}

// tierInfo() attend un slug de palier (voir lib/ranks.ts) ; ce petit
// utilitaire retrouve le bon palier à partir des points directement, pour
// ne pas dupliquer les seuils une deuxième fois ici.
function pointsToTierLookup(points: number): string {
  if (points >= 1500) return 'legende'
  if (points >= 900) return 'sage'
  if (points >= 500) return 'ancien'
  if (points >= 250) return 'chasseur'
  if (points >= 100) return 'villageois'
  return 'nouveau_venu'
}
