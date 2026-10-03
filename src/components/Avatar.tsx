import { memo } from 'react'
import { AvatarIcon } from './AvatarIcon'
import { AvatarArt } from './AvatarArt'
import { parseAvatarConfig, type AvatarMood } from '../lib/avatarParts'

/**
 * Avatar d'un joueur. Avec une configuration personnalisée (voir migration
 * 0190), dessine le buste en SVG ; sans configuration, retombe sur l'ancien
 * rendu (pastille de couleur avec icône ou initiale) pour que rien ne change
 * pour les joueurs qui n'ont pas encore personnalisé le leur.
 * `className` porte la taille (ex. `h-10 w-10`).
 */
// memo (audit de fluidité du 2026-10-01) : rendu SVG procédural coûteux
// (plusieurs dizaines de formes par avatar, voir AvatarArt.tsx) appelé jusqu'à 25 fois
// dans une grille de joueurs — sans ça, un seul avatar qui change recalcule
// les 25, et toute grille parente qui re-rend pour une raison sans rapport
// (voir PlayerGrid.tsx) les recalcule tous une fois de plus. Bénéfice
// partiel seulement quand `config`/`icon` restent les mêmes références
// qu'au rendu précédent (une mise à jour réelle de `view` recrée tous les
// objets joueur, voir useGame.ts) — net gain partout ailleurs (listes de
// coéquipiers, pastilles de profil...) où ces props restent stables.
export const Avatar = memo(function Avatar({
  config,
  icon,
  color,
  name,
  className = 'h-10 w-10',
  mood = 'smile',
}: {
  config?: unknown
  icon?: string | null
  color?: string
  name?: string
  className?: string
  mood?: AvatarMood
}) {
  const parsed = parseAvatarConfig(config)
  if (parsed) {
    return (
      <span className={`inline-block shrink-0 overflow-hidden rounded-full ${className}`}>
        <AvatarArt config={parsed} mood={mood} />
      </span>
    )
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#05070d] ${className}`}
      style={{ backgroundColor: color ?? '#334160' }}
    >
      {icon ? <AvatarIcon icon={icon} className="h-1/2 w-1/2" /> : (name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  )
})
