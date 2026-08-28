/** Petit badge doré, permanent, à côté de RankBadge dans l'en-tête du
 * tableau de bord : la série de connexion quotidienne (migration 0110).
 * Couleur ambre (moon-*) plutôt que le rouge (blood-*) du 🔥 des victoires
 * dans RankBadge, pour que les deux séries restent visuellement distinctes
 * malgré leur proximité — même seuil d'affichage (≥ 2) pour ne pas faire de
 * bruit visuel dès le premier jour. */
export function LoginStreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-moon-400/35 bg-night-800/60 py-1 px-2 text-xs text-moon-300 sm:py-1.5 sm:px-3 sm:text-sm">
      📅{streak}
    </span>
  )
}
