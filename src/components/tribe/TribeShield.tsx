import { TribeCrest } from './TribeCrest'

/** Le blason d'une tribu : l'écu dessiné (TribeCrest), dans la boîte de la taille demandée.
 * Les classes de taille de texte des anciens appels sont sans effet. */
export function TribeShield({ emblem, color, className = 'h-12 w-12', spears }: { emblem: string; color: string; className?: string; spears?: boolean }) {
  return <TribeCrest emblem={emblem} color={color} className={className} spears={spears} />
}
