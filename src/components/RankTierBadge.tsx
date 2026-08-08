import type { RankTier } from '../lib/ranks'

/** Badge vectoriel d'un palier de rang, remplace l'ancien champ `emoji` de
 * RANK_TIERS (lib/ranks.ts) — même logique que les glyphes SVG d'avatar
 * (AvatarIcon.tsx) : rendu identique partout, pas de variation d'un système
 * à l'autre comme avec les emoji.
 *
 * Le CADRE autour de l'icône monte en gamme avec le palier — c'est lui qui
 * porte la sensation de progression, pas l'icône (qui reste simple à tous
 * les niveaux) : aucun cadre → simple anneau → anneau gradué → double
 * anneau teinté → anneau à halo de points → badge plein en dégradé avec
 * lauriers et rayons. Couleurs reprises telles quelles du thème nuit
 * (index.css) plutôt que des classes Tailwind `night-*`/`moon-*` : ce badge
 * n'apparaît que sur des pages (Dashboard, Stats, Aide) qui ne participent
 * jamais au basculement jour/nuit animé (réservé à GameRoom, voir
 * tailwind.config.js) — les valeurs sont donc fixes sans risque de
 * désynchronisation. blood-500/moon-400 du dégradé du palier Légende sont
 * déjà des couleurs fixes partout dans l'appli (voir le bouton primaire),
 * jamais pilotées par le thème. */
export function RankTierBadge({ tier, size = 28, className }: { tier: RankTier; size?: number; className?: string }) {
  const props = { width: size, height: size, className }
  switch (tier) {
    case 'nouveau_venu':
      return <NouveauVenuBadge {...props} />
    case 'villageois':
      return <ApprentiBadge {...props} />
    case 'chasseur':
      return <EclaireurBadge {...props} />
    case 'ancien':
      return <DoyenBadge {...props} />
    case 'sage':
      return <SageBadge {...props} />
    case 'legende':
      return <LegendeBadge {...props} />
  }
}

type SvgProps = { width: number; height: number; className?: string }

function NouveauVenuBadge({ width, height, className }: SvgProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 72 72" className={className} aria-hidden="true">
      <g
        transform="translate(24,24)"
        stroke="rgba(232,220,196,0.55)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M12 20V11" />
        <path d="M12 12C12 8 9 6 6 6c0 3.5 2.5 6 6 6Z" />
        <path d="M12 12c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z" />
      </g>
    </svg>
  )
}

function ApprentiBadge({ width, height, className }: SvgProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 72 72" className={className} aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(217,154,63,0.35)" strokeWidth="1" />
      <g transform="translate(24,24)" stroke="#d99a3f" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5V5.5Z" />
        <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5c.8 0 1.5-.7 1.5-1.5V5.5Z" />
        <path d="M12 4v16" strokeWidth="0.8" />
      </g>
    </svg>
  )
}

function EclaireurBadge({ width, height, className }: SvgProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 72 72" className={className} aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(217,154,63,0.45)" strokeWidth="1" />
      <g stroke="rgba(217,154,63,0.6)" strokeWidth="1" strokeLinecap="round">
        <path d="M36 4v5M36 63v5M4 36h5M63 36h5" />
      </g>
      <g transform="translate(24,24)" stroke="#d99a3f" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M15 9l-2 5-5 2 2-5 5-2Z" />
        <circle cx="12" cy="12" r="0.9" fill="#d99a3f" stroke="none" />
      </g>
    </svg>
  )
}

function DoyenBadge({ width, height, className }: SvgProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 72 72" className={className} aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="rgba(194,67,42,0.08)" stroke="rgba(194,67,42,0.55)" strokeWidth="1" />
      <circle cx="36" cy="36" r="25" fill="none" stroke="rgba(194,67,42,0.3)" strokeWidth="1" />
      <g transform="translate(24,24)" stroke="#e0623f" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="12" y1="21" x2="12" y2="7" />
        <circle cx="12" cy="5" r="2.2" />
        <path d="M8 21h8" />
      </g>
    </svg>
  )
}

function SageBadge({ width, height, className }: SvgProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 76 76" className={className} aria-hidden="true">
      <circle cx="38" cy="38" r="32" fill="rgba(217,154,63,0.06)" stroke="rgba(217,154,63,0.5)" strokeWidth="1" />
      <g fill="#d99a3f">
        <circle cx="38" cy="4" r="1.2" />
        <circle cx="38" cy="72" r="1.2" />
        <circle cx="4" cy="38" r="1.2" />
        <circle cx="72" cy="38" r="1.2" />
        <circle cx="14.4" cy="14.4" r="1" />
        <circle cx="61.6" cy="14.4" r="1" />
        <circle cx="14.4" cy="61.6" r="1" />
        <circle cx="61.6" cy="61.6" r="1" />
      </g>
      <g transform="translate(26,26)" stroke="#e0a84a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M18 4C11 6 6 12 6 19c7 0 13-5 15-12 .4-1.8-.8-3.3-3-3Z" />
        <path d="M16 6 7 15" strokeWidth="0.9" />
      </g>
    </svg>
  )
}

function LegendeBadge({ width, height, className }: SvgProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 88 88" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rankLegendGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c2432a" />
          <stop offset="100%" stopColor="#e0a84a" />
        </linearGradient>
      </defs>
      <g stroke="rgba(224,168,74,0.55)" strokeWidth="1" strokeLinecap="round">
        <path d="M44 2v8M44 78v8M2 44h8M78 44h8M13 13l6 6M69 13l-6 6M13 75l6-6M69 75l-6-6" />
      </g>
      <circle cx="44" cy="44" r="34" fill="url(#rankLegendGrad)" stroke="#e8dcc4" strokeWidth="1" />
      <circle cx="44" cy="44" r="29" fill="none" stroke="rgba(232,220,196,0.5)" strokeWidth="0.8" />
      <g stroke="#e8dcc4" strokeWidth="1.3" strokeLinecap="round" fill="none">
        <path d="M14 52c4 6 9 9 13 10M12 46c5 1 8 4 10 8" />
        <path d="M74 52c-4 6-9 9-13 10M76 46c-5 1-8 4-10 8" />
      </g>
      <g transform="translate(32,32)" stroke="#fdf6e3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M4 18h16l-1.5-8-4 3-2.5-5-2.5 5-4-3L4 18Z" />
        <circle cx="12" cy="6" r="1" fill="#fdf6e3" stroke="none" />
      </g>
    </svg>
  )
}
