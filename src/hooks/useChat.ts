import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ChatChannel, ChatMessage, ChatReaction, ReactionEmoji } from '../types/game'

/** Identité réelle démasquée pour un message anonyme — n'existe que pour les
 * messages que la RLS de chat_message_identities autorise le joueur courant
 * à voir : les siens, et tous ceux de la partie s'il est la Petite Fille
 * vivante (voir migration 0026). */
interface RevealedIdentity {
  user_id: string
  display_name: string
}

export function useChat(gameId: string | null, channel: ChatChannel | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [identities, setIdentities] = useState<Record<string, RevealedIdentity>>({})
  const [reactions, setReactions] = useState<ChatReaction[]>([])
  const [sending, setSending] = useState(false)
  const seenIds = useRef<Set<string>>(new Set())
  const seenIdentityIds = useRef<Set<string>>(new Set())
  const seenReactionIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    setMessages([])
    setIdentities({})
    setReactions([])
    seenIds.current = new Set()
    seenIdentityIds.current = new Set()
    seenReactionIds.current = new Set()
    if (!gameId || !channel) return

    let cancelled = false

    supabase
      .from('chat_messages')
      .select('*')
      .eq('game_id', gameId)
      .eq('channel', channel)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled || !data) return
        data.forEach((m) => seenIds.current.add(m.id))
        setMessages(data as ChatMessage[])
      })

    // Seul le salon "village" peut contenir des messages anonymes (envoyés
    // la nuit) : inutile d'interroger chat_message_identities pour "wolves"
    // ou "graveyard", qui restent toujours nominatifs.
    if (channel === 'village') {
      supabase
        .from('chat_message_identities')
        .select('message_id, user_id, display_name')
        .eq('game_id', gameId)
        .then(({ data }) => {
          if (cancelled || !data) return
          const next: Record<string, RevealedIdentity> = {}
          data.forEach((row: { message_id: string; user_id: string; display_name: string }) => {
            seenIdentityIds.current.add(row.message_id)
            next[row.message_id] = { user_id: row.user_id, display_name: row.display_name }
          })
          setIdentities((prev) => ({ ...prev, ...next }))
        })
    }

    supabase
      .from('chat_message_reactions')
      .select('id, message_id, user_id, display_name, emoji')
      .eq('game_id', gameId)
      .eq('channel', channel)
      .then(({ data }) => {
        if (cancelled || !data) return
        data.forEach((r) => seenReactionIds.current.add(r.id))
        setReactions(data as ChatReaction[])
      })

    let chatChannel = supabase
      .channel(`chat-${gameId}-${channel}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as ChatMessage
          if (row.channel !== channel) return
          if (seenIds.current.has(row.id)) return
          seenIds.current.add(row.id)
          setMessages((prev) => [...prev, row])
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reactions', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as ChatReaction & { channel: ChatChannel }
          if (row.channel !== channel) return
          if (seenReactionIds.current.has(row.id)) return
          seenReactionIds.current.add(row.id)
          setReactions((prev) => [...prev, row])
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_message_reactions', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.old as { id: string }
          seenReactionIds.current.delete(row.id)
          setReactions((prev) => prev.filter((r) => r.id !== row.id))
        }
      )

    if (channel === 'village') {
      chatChannel = chatChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_identities', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string; display_name: string }
          if (seenIdentityIds.current.has(row.message_id)) return
          seenIdentityIds.current.add(row.message_id)
          setIdentities((prev) => ({ ...prev, [row.message_id]: { user_id: row.user_id, display_name: row.display_name } }))
        }
      )
    }

    const sub = chatChannel.subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(sub)
    }
  }, [gameId, channel])

  async function send(content: string, replyTo?: string | null) {
    if (!gameId || !channel) return
    const trimmed = content.trim()
    if (!trimmed) return
    setSending(true)
    const { error } = await supabase.rpc('send_chat_message', {
      p_game_id: gameId,
      p_channel: channel,
      p_content: trimmed,
      p_reply_to: replyTo ?? null,
    })
    setSending(false)
    return error
  }

  // Pas de mise à jour optimiste locale : comme pour `send` ci-dessus, l'ajout
  // ou le retrait réel dans `reactions` vient de l'écho realtime (INSERT ou
  // DELETE sur chat_message_reactions), pas de cet appel — évite de dupliquer
  // la logique d'affichage groupé ici en plus de ChatPanel.tsx.
  async function toggleReaction(messageId: string, emoji: ReactionEmoji) {
    const { error } = await supabase.rpc('toggle_chat_reaction', {
      p_message_id: messageId,
      p_emoji: emoji,
    })
    return error
  }

  return { messages, identities, reactions, send, sending, toggleReaction }
}
