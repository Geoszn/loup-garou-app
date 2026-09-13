/** Petit badge permanent dans l'en-tête du tableau de bord, à côté de
 * RankBadge/LoginStreakBadge : le total de Loup Coins accumulés (migration
 * 0146) — monnaie gagnée exclusivement via les quêtes quotidiennes,
 * totalement séparée du rang. Toujours visible, même à 0, contrairement aux
 * deux badges voisins (seuil d'affichage ≥ 2) : c'est une nouvelle monnaie,
 * mieux vaut qu'elle soit repérable dès le premier jour plutôt que de
 * paraître absente du jeu. */
export function LoupCoinsBadge({ coins }: { coins: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-400/35 bg-night-800/60 py-1 px-2 text-xs text-amber-300 sm:py-1.5 sm:px-3 sm:text-sm">
      🪙{coins}
    </span>
  )
}
