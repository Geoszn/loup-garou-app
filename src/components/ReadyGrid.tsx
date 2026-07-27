import type { PublicPlayer } from '../types/game'
import { AvatarIcon } from './AvatarIcon'

/** Grille d'avatars avec un anneau vert (prêt / d'accord) ou rouge (en
 * attente) — utilisée à la fois pour "qui a mémorisé son rôle" (distribution
 * des rôles) et "qui est d'accord pour voter" (débat du village), pour
 * garder une seule visualisation cohérente pour ce genre de "check" collectif.
 *
 * Anneau épais (4px, pas juste 2) + pastille ✓/✕ superposée en plus de la
 * couleur : le simple rouge/vert est difficile à distinguer pour une partie
 * des joueurs (daltonisme rouge-vert notamment), donc la forme du symbole
 * porte la même information indépendamment de la couleur. */
export function ReadyGrid({ players, readyIds }: { players: PublicPlayer[]; readyIds: string[] }) {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
      {players.map((p) => {
        const ready = readyIds.includes(p.user_id)
        return (
          <div key={p.id} className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-[#05070d] ring-4 transition-colors ${
                  ready
                    ? 'ring-green-500 shadow-[0_0_12px_-1px_rgba(34,197,94,0.7)]'
                    : 'ring-blood-500 shadow-[0_0_12px_-1px_rgba(194,67,42,0.6)]'
                }`}
                style={{ backgroundColor: p.avatar_color }}
              >
                {p.avatar_icon ? <AvatarIcon icon={p.avatar_icon} className="h-6 w-6" /> : p.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span
                className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-night-950 text-[11px] font-bold leading-none ${
                  ready ? 'bg-green-500 text-night-950' : 'bg-blood-500 text-moon-100'
                }`}
              >
                {ready ? '✓' : '✕'}
              </span>
            </div>
            <span className="max-w-full truncate text-[10px] text-moon-200/60">{p.display_name}</span>
          </div>
        )
      })}
    </div>
  )
}
