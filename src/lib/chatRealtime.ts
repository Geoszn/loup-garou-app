import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { ChatMessage, ChatReaction } from '../types/game'

// UN SEUL canal Realtime de chat par partie et par navigateur, partagé par tous
// ceux qui écoutent le chat (le panneau de chat ouvert, mais aussi les pastilles
// « non lus » des autres onglets — voir useChat.ts).
//
// Pourquoi : chaque abonnement `postgres_changes` oblige Supabase Realtime à
// revérifier, pour CHAQUE changement de ligne, que l'abonné a le droit de la
// lire (RLS — ici can_read_channel, qui fait plusieurs requêtes), sur un seul
// fil d'exécution (voir https://supabase.com/docs/guides/realtime/benchmarks).
// Avant, un joueur en partie ouvrait un canal par onglet de chat ET un par
// pastille « non lu » : jusqu'à ~5 abonnements à chat_messages par joueur, donc
// ~60 vérifications de droits (et ~60 messages Realtime, contre un plafond de
// 500/s sur Pro) pour chaque message écrit dans une partie de 12 joueurs.
// Désormais : 1 abonnement par joueur, relayé en mémoire à tous les écouteurs.
interface Hub {
  channel: RealtimeChannel
  handlers: Set<ChatHandlers>
  teardown: ReturnType<typeof setTimeout> | null
}

export interface ChatHandlers {
  onMessage?: (row: ChatMessage) => void
  onReactionInsert?: (row: ChatReaction & { channel: string }) => void
  onReactionDelete?: (row: { id: string }) => void
  onIdentity?: (row: { message_id: string; user_id: string; display_name: string }) => void
}

const hubs = new Map<string, Hub>()
// Les changements d'onglet / de phase démontent puis remontent les écouteurs en
// quelques ms : on garde le canal un instant plutôt que de le recréer.
const TEARDOWN_DELAY_MS = 3000

function open(gameId: string): Hub {
  const channel = supabase.channel(`chat-${gameId}`)
  const hub: Hub = { channel, handlers: new Set(), teardown: null }
  const each = (fn: (h: ChatHandlers) => void) => hub.handlers.forEach(fn)
  const filter = `game_id=eq.${gameId}`
  channel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, (p) => each((h) => h.onMessage?.(p.new as ChatMessage)))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_reactions', filter }, (p) =>
      each((h) => h.onReactionInsert?.(p.new as ChatReaction & { channel: string }))
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_message_reactions', filter }, (p) => each((h) => h.onReactionDelete?.(p.old as { id: string })))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_identities', filter }, (p) =>
      each((h) => h.onIdentity?.(p.new as { message_id: string; user_id: string; display_name: string }))
    )
    .subscribe()
  hubs.set(gameId, hub)
  return hub
}

/** S'abonne aux évènements de chat de la partie ; renvoie la fonction de désabonnement. */
export function subscribeChatEvents(gameId: string, handlers: ChatHandlers): () => void {
  const hub = hubs.get(gameId) ?? open(gameId)
  if (hub.teardown) clearTimeout(hub.teardown)
  hub.teardown = null
  hub.handlers.add(handlers)
  return () => {
    hub.handlers.delete(handlers)
    if (hub.handlers.size > 0) return
    hub.teardown = setTimeout(() => {
      if (hub.handlers.size > 0) return
      supabase.removeChannel(hub.channel)
      if (hubs.get(gameId) === hub) hubs.delete(gameId)
    }, TEARDOWN_DELAY_MS)
  }
}
