import { colorGradient, emblemIcon } from '../../lib/tribe'

/** Le blason d'une tribu : un écu coloré portant son emblème. */
export function TribeShield({ emblem, color, className = 'h-12 w-12 text-xl' }: { emblem: string; color: string; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-gradient-to-b ${colorGradient(color)} shadow-lg ${className}`}
      style={{ clipPath: 'polygon(50% 0, 100% 12%, 100% 62%, 50% 100%, 0 62%, 0 12%)', paddingBottom: '6%' }}
      aria-hidden="true"
    >
      {emblemIcon(emblem)}
    </span>
  )
}
