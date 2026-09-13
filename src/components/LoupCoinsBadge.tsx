import { Link } from 'react-router-dom'
import { LoupCoinIcon } from './LoupCoinIcon'

/** Petit badge permanent dans l'en-tête du tableau de bord, à côté de
 * RankBadge/LoginStreakBadge : le total de Loup Coins accumulés (migration
 * 0146) — monnaie gagnée exclusivement via les quêtes quotidiennes,
 * totalement séparée du rang. Toujours visible, même à 0, contrairement aux
 * deux badges voisins (seuil d'affichage ≥ 2) : c'est une nouvelle monnaie,
 * mieux vaut qu'elle soit repérable dès le premier jour plutôt que de
 * paraître absente du jeu. Cliquable : ouvre le Loup Store (LoupStore.tsx),
 * qui détaille le solde, le total gagné et l'historique des transactions. */
export function LoupCoinsBadge({ coins }: { coins: number }) {
  return (
    <Link
      to="/loup-store"
      className="flex shrink-0 items-center gap-1 rounded-full border border-amber-400/35 bg-night-800/60 py-1 px-2 text-xs text-amber-300 transition-colors hover:border-amber-400/60 sm:py-1.5 sm:px-3 sm:text-sm"
    >
      <LoupCoinIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      {coins}
    </Link>
  )
}
