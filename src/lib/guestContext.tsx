import { createContext, useContext, useMemo, type ReactNode } from 'react'

// Qui est invité (compte temporaire) dans la partie en cours — fourni par GameRoom et Lobby à partir de `guest_user_ids` (vue de partie,
// migration 0250) pour que la grille des joueurs et le chat puissent afficher un petit badge « Invité » sans recevoir de prop partout.
const EMPTY: ReadonlySet<string> = new Set()
const GuestIdsContext = createContext<ReadonlySet<string>>(EMPTY)

export function GuestIdsProvider({ ids, children }: { ids: string[] | undefined; children: ReactNode }) {
  const set = useMemo<ReadonlySet<string>>(() => (ids && ids.length > 0 ? new Set(ids) : EMPTY), [ids])
  return <GuestIdsContext.Provider value={set}>{children}</GuestIdsContext.Provider>
}

export function useGuestIds(): ReadonlySet<string> {
  return useContext(GuestIdsContext)
}

/** Petit badge « Invité » à côté d'un pseudo. */
export function GuestBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-moon-400/40 bg-moon-400/10 px-1.5 py-px text-[9px] font-bold uppercase leading-none tracking-wider text-moon-300">{label}</span>
  )
}
