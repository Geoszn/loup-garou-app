import type { ReactNode } from 'react'

/** Glyphes vectoriels (traits `currentColor`, grille 24×24) remplaçant
 * l'affichage brut des emoji d'avatar (AVATAR_ICONS, lib/avatars.ts) : rendu
 * identique sur toutes les plateformes, contrairement aux emoji qui varient
 * beaucoup d'un système à l'autre (et manquent carrément sur certains). Style
 * volontairement minimaliste (silhouettes/traits simples, pas d'illustration
 * détaillée) pour rester cohérent d'une icône à l'autre.
 *
 * Chaque entrée ne contient QUE le contenu interne du <svg> (les formes),
 * partagé par le composant AvatarIcon ci-dessous qui fournit le <svg> commun
 * (taille, viewBox, style de trait). */
const GLYPHS: Record<string, ReactNode> = {
  // 🐺 Loup — tête arrondie, oreilles pointues, museau marqué.
  '🐺': (
    <>
      <path d="M7 14c0-4.2 2.2-7.5 5-7.5s5 3.3 5 7.5c0 3-2.2 5-5 5s-5-2-5-5Z" />
      <path d="M8 8 5 3l3.2 2.3M16 8l3-5-3.2 2.3" />
      <circle cx="10" cy="13" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14" cy="13" r="0.8" fill="currentColor" stroke="none" />
      <path d="M11 16h2l-1 1.5-1-1.5Z" fill="currentColor" stroke="none" />
    </>
  ),
  // 🌕 Pleine lune — disque plein.
  '🌕': <circle cx="12" cy="12" r="7.5" fill="currentColor" stroke="none" />,
  // 🦇 Chauve-souris — corps + ailes triangulaires.
  '🦇': (
    <>
      <ellipse cx="12" cy="12" rx="1.6" ry="3" />
      <path d="M10.5 10.5 3 6.5l2.5 7 4.7-2M13.5 10.5 21 6.5l-2.5 7-4.7-2" />
      <path d="M10.5 9.5 9 7M13.5 9.5 15 7" />
    </>
  ),
  // 🕯️ Bougie — corps + flamme.
  '🕯️': (
    <>
      <rect x="9.5" y="10" width="5" height="10" rx="1" />
      <path d="M12 4c1.6 1.9 1.6 3.4 0 4.8C10.4 7.4 10.4 5.9 12 4Z" fill="currentColor" stroke="none" />
    </>
  ),
  // ⚰️ Cercueil — hexagone allongé.
  '⚰️': <polygon points="9,4 15,4 17.5,9 17.5,15 15,20 9,20 6.5,15 6.5,9" />,
  // 🔪 Couteau — lame + manche.
  '🔪': (
    <>
      <polygon points="5,16 16,5 18.5,7.5 7.5,18.5" />
      <line x1="5" y1="16" x2="2.5" y2="20" strokeWidth="2.4" />
    </>
  ),
  // 🩸 Goutte de sang.
  '🩸': <path d="M12 3c4 5 6 8.7 6 11.5A6 6 0 1 1 6 14.5C6 11.7 8 8 12 3Z" fill="currentColor" stroke="none" />,
  // 👁️ Œil.
  '👁️': (
    <>
      <path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7Z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  // 🌲 Sapin — trois triangles empilés + tronc.
  '🌲': (
    <>
      <polygon points="12,3 7.5,9 16.5,9" />
      <polygon points="12,7 6,14 18,14" />
      <polygon points="12,11 5,19 19,19" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </>
  ),
  // 🏚️ Maison délabrée — toit fissuré + murs.
  '🏚️': (
    <>
      <polyline points="4,11 12,4 20,11" />
      <path d="M6 11v9h12v-9" />
      <line x1="10" y1="20" x2="10" y2="15" />
      <line x1="14" y1="20" x2="14" y2="15" />
      <line x1="14" y1="7.5" x2="11" y2="11" />
    </>
  ),
  // 🦉 Hibou — deux grands yeux, aigrettes.
  '🦉': (
    <>
      <path d="M6 9 4 5M18 9l2-4" />
      <ellipse cx="12" cy="14" rx="6" ry="6" />
      <circle cx="9.3" cy="12.5" r="2" />
      <circle cx="14.7" cy="12.5" r="2" />
      <circle cx="9.3" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
      <path d="M11 15.5 12 17.2 13 15.5Z" fill="currentColor" stroke="none" />
    </>
  ),
  // 🕷️ Araignée — corps + pattes.
  '🕷️': (
    <>
      <circle cx="12" cy="9.5" r="2" />
      <ellipse cx="12" cy="15" rx="3.6" ry="4.2" />
      <path d="M9.5 8.5 3 5M9.5 11 2.5 11M9.8 14 3.5 16M14.5 8.5 21 5M14.5 11l6.5 0M14.2 14l6.3 2" />
    </>
  ),
  // 🐗 Sanglier — museau + défenses.
  '🐗': (
    <>
      <path d="M5 12c0-3.3 3-6 7-6s7 2.7 7 6-2.5 6.5-7 6.5S5 15.3 5 12Z" />
      <rect x="9" y="12.5" width="6" height="3.5" rx="1" />
      <path d="M9.5 16 8 19M14.5 16l1.5 3" strokeWidth="2" />
      <circle cx="9.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
      <path d="M6 8 4 5" />
    </>
  ),
  // 🦁 Lion — visage + crinière rayonnante.
  '🦁': (
    <>
      <circle cx="12" cy="13" r="3.6" />
      <circle cx="10.4" cy="12.3" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="13.6" cy="12.3" r="0.6" fill="currentColor" stroke="none" />
      <path d="M12 21V17.4M12 3v3.6M4.2 6.2l2.5 2.6M19.8 6.2l-2.5 2.6M4.2 19.8l2.5-2.6M19.8 19.8l-2.5-2.6M3 13h3.6M21 13h-3.6" />
    </>
  ),
  // 🐆 Léopard — tête + taches.
  '🐆': (
    <>
      <circle cx="12" cy="13.5" r="5" />
      <path d="M8.5 9 6 5M15.5 9l2.5-4" />
      <circle cx="10" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="16" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="17" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15.5" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  // 🦅 Aigle — silhouette en vol.
  '🦅': (
    <path d="M2 15c4-7 8-3.5 10 0 2-3.5 6-7 10 0-4 2.5-7 6.5-10 8-3-1.5-6-5.5-10-8Z" />
  ),
  // 🐍 Serpent — ondulation + tête.
  '🐍': (
    <>
      <path d="M4 7c4 0 1.5 4.5 5.5 4.5S8 16 12 16s-1.5 4.5 2.5 4.5" />
      <circle cx="18" cy="6" r="1.8" />
      <path d="M19.5 5.3 21.5 4.3M19.5 6.7l2 1" strokeWidth="1" />
    </>
  ),
  // 🦂 Scorpion — corps + queue recourbée + pinces.
  '🦂': (
    <>
      <ellipse cx="9.5" cy="15" rx="3.6" ry="2.6" />
      <path d="M6.5 14 3 12.5M6.5 14 3 15.5" />
      <path d="M6.5 16 3.2 16.8M6.5 16l-2 2.4" />
      <path d="M13 14c3-.5 5-2.5 5.5-5.5.3-2-1-3.5-2.5-3" />
      <circle cx="17.5" cy="5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // 🔥 Feu — flamme.
  '🔥': (
    <path
      d="M12 2c3 4 5 7 5 10a5 5 0 0 1-10 0c0-1 .3-2 1-3 .2 1 .8 1.5 1.5 1.2C8.6 8 9 5 12 2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  // ⚡ Éclair.
  '⚡': <polygon points="13,2 5,14 11,14 9,22 19,10 12,10" fill="currentColor" stroke="none" />,
  // 🌑 Nouvelle lune — croissant.
  '🌑': <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" fill="currentColor" stroke="none" />,
  // ⚔️ Épées croisées.
  '⚔️': (
    <>
      <line x1="4" y1="4" x2="19" y2="19" />
      <line x1="20" y1="4" x2="5" y2="19" />
      <path d="M4 4 6.2 4.2M4 4 4.2 6.2M20 4 17.8 4.2M20 4 19.8 6.2" strokeWidth="2" />
    </>
  ),
  // 🪶 Plume.
  '🪶': (
    <>
      <path d="M19 3C11 5 5 12 5 20c8 0 15-6 17-14 .5-2-1-3-3-3Z" />
      <path d="M17 5 7 15M15 8l-4.5 4.5M13 11l-3 3" strokeWidth="1" />
    </>
  ),
  // 🛖 Case au toit de chaume.
  '🛖': (
    <>
      <polyline points="3,12 12,4 21,12" />
      <path d="M6 11.5V20h12v-8.5" />
      <line x1="11" y1="20" x2="11" y2="15" />
      <line x1="13" y1="20" x2="13" y2="15" />
      <path d="M8 9.5h8M6.8 11h10.4" strokeWidth="1" />
    </>
  ),
  // 🥁 Tambour — fût + baguettes.
  '🥁': (
    <>
      <ellipse cx="12" cy="8" rx="7" ry="2.4" />
      <path d="M5 8v8c0 1.3 3.1 2.4 7 2.4s7-1.1 7-2.4V8" />
      <line x1="9" y1="4.5" x2="16.5" y2="10.5" strokeWidth="1.2" />
      <line x1="15" y1="4.5" x2="8" y2="9.5" strokeWidth="1.2" />
    </>
  ),
}

/** Rendu vectoriel d'une icône d'avatar (voir GLYPHS ci-dessus). Si `icon`
 * ne correspond à aucun glyphe connu (donnée ancienne/inattendue), on
 * retombe sur l'emoji brut tel quel plutôt que de n'afficher rien —
 * dégradation silencieuse, jamais bloquante. `className` pilote la taille
 * (ex. "h-5 w-5") ET la couleur (les traits suivent `currentColor`). */
export function AvatarIcon({ icon, className = 'h-5 w-5' }: { icon?: string | null; className?: string }) {
  if (!icon) return null
  const glyph = GLYPHS[icon]
  if (!glyph) return <span className={className.includes('text-') ? className : `${className} inline-block`}>{icon}</span>

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  )
}
