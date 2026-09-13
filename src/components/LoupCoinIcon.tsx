/** Symbole dédié aux Loup Coins (migration 0146/0147) — remplace l'emoji 🪙
 * générique utilisé jusqu'ici : une pièce dorée avec une empreinte de patte
 * en relief, pour une monnaie qui a sa propre identité visuelle plutôt que
 * d'emprunter un emoji "pièce" sans lien avec le jeu. Couleurs fixes (pas
 * `currentColor`) : la pièce doit rester reconnaissable comme "de l'or",
 * quel que soit le texte ou le fond autour d'elle. */
export function LoupCoinIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#f2b84b" stroke="#a86a1e" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="9" fill="none" stroke="#a86a1e" strokeWidth="0.8" opacity="0.5" />
      <g fill="#8a5a1e" opacity="0.9">
        <ellipse cx="12" cy="14.6" rx="3.4" ry="2.6" />
        <circle cx="8.1" cy="10.4" r="1.5" />
        <circle cx="10.3" cy="8.1" r="1.55" />
        <circle cx="13.7" cy="8.1" r="1.55" />
        <circle cx="15.9" cy="10.4" r="1.5" />
      </g>
    </svg>
  )
}
