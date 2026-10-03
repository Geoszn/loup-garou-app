import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Qui est dans le vocal d'une partie, SANS passer par Daily (Daily ne peut le
// dire qu'à ceux qui y sont déjà connectés — donc facturés — alors que
// l'indicateur sert justement à décider d'y entrer, voir VoiceChat.tsx).
// Un canal de présence Supabase par partie (`voice-${gameId}`), distinct de
// `game-${gameId}` (useGame.ts) qui appartient à un autre hook : plusieurs
// <VoiceChat> peuvent coexister sur la même page (onglets Village / Loups),
// donc le canal est partagé et compté par références, plutôt que créé à
// chaque montage (supabase.channel() renvoie le même canal pour un même nom,
// et y ajouter des écouteurs après abonnement lèverait une erreur).
//
// La présence se nettoie toute seule à la déconnexion (onglet fermé, perte
// réseau) : pas de risque de joueur « resté dans le vocal » à tort.
interface Entry {
  channel: RealtimeChannel
  refs: number
  subscribed: boolean
  // Un jeton par <VoiceChat> actuellement « dans le vocal » : le joueur est
  // annoncé tant qu'au moins un l'est (évite qu'un composant qui se démonte
  // ne le retire alors qu'un autre est toujours connecté).
  voters: Set<object>
  teardown: ReturnType<typeof setTimeout> | null
}

const entries = new Map<string, Entry>()
const idsByGame = new Map<string, string[]>()
const listeners = new Set<() => void>()
const EMPTY: string[] = []
// Délai avant de fermer le canal quand plus aucun composant ne l'utilise : les
// changements de phase démontent/remontent <VoiceChat> en quelques ms.
const TEARDOWN_DELAY_MS = 5000

const notify = () => listeners.forEach((l) => l())

function announce(entry: Entry) {
  if (entry.subscribed) void entry.channel.track({ in_voice: entry.voters.size > 0 })
}

function acquire(gameId: string, selfUserId: string): Entry {
  let entry = entries.get(gameId)
  if (entry) {
    if (entry.teardown) clearTimeout(entry.teardown)
    entry.teardown = null
    entry.refs++
    return entry
  }
  const channel = supabase.channel(`voice-${gameId}`, { config: { presence: { key: selfUserId } } })
  const created: Entry = { channel, refs: 1, subscribed: false, voters: new Set(), teardown: null }
  entry = created
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ in_voice?: boolean }>()
      const ids = Object.entries(state)
        .filter(([, metas]) => metas.some((m) => m.in_voice))
        .map(([id]) => id)
        .sort()
      const prev = idsByGame.get(gameId) ?? EMPTY
      if (ids.join(',') === prev.join(',')) return
      idsByGame.set(gameId, ids)
      notify()
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        created.subscribed = true
        announce(created)
      }
    })
  entries.set(gameId, created)
  return created
}

function release(gameId: string) {
  const entry = entries.get(gameId)
  if (!entry) return
  entry.refs--
  if (entry.refs > 0) return
  entry.teardown = setTimeout(() => {
    supabase.removeChannel(entry.channel)
    entries.delete(gameId)
    idsByGame.delete(gameId)
    notify()
  }, TEARDOWN_DELAY_MS)
}

/** Ids (user_id) de tous les joueurs actuellement dans le vocal de la partie,
 * y compris soi-même — à filtrer côté appelant. `inVoice` : ce composant
 * représente-t-il un joueur qui participe réellement (rejoint, pas en simple
 * écoute de fantôme) ? */
export function useVoicePresence(gameId: string, selfUserId: string | null, inVoice: boolean): string[] {
  const token = useRef({}).current

  useEffect(() => {
    if (!selfUserId) return
    acquire(gameId, selfUserId)
    return () => release(gameId)
  }, [gameId, selfUserId])

  useEffect(() => {
    const entry = entries.get(gameId)
    if (!entry) return
    if (inVoice) entry.voters.add(token)
    else entry.voters.delete(token)
    announce(entry)
    return () => {
      const e = entries.get(gameId)
      if (!e) return
      e.voters.delete(token)
      announce(e)
    }
  }, [gameId, selfUserId, inVoice, token])

  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => idsByGame.get(gameId) ?? EMPTY,
    () => EMPTY
  )
}
