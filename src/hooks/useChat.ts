import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { subscribeChatEvents } from '../lib/chatRealtime'
import type { ChatChannel, ChatMessage, ChatReaction, ReactionEmoji } from '../types/game'

/** Identité réelle démasquée pour un message anonyme — n'existe que pour les
 * messages que la RLS de chat_message_identities autorise le joueur courant
 * à voir : les siens, et tous ceux de la partie s'il est la Petite Fille
 * vivante (voir migration 0026). Exportée pour que ChatPanel.tsx puisse
 * l'utiliser sans dupliquer la définition (voir MessageRow, mémoïsé — il en
 * a besoin pour typer la prop `identities`). */
export interface RevealedIdentity {
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

    // Un seul canal Realtime partagé par partie (voir lib/chatRealtime.ts).
    const unsubscribe = subscribeChatEvents(gameId, {
      onMessage: (row) => {
        if (row.channel !== channel) return
        if (seenIds.current.has(row.id)) return
        seenIds.current.add(row.id)
        setMessages((prev) => [...prev, row])
      },
      onReactionInsert: (row) => {
        if (row.channel !== channel) return
        if (seenReactionIds.current.has(row.id)) return
        seenReactionIds.current.add(row.id)
        setReactions((prev) => [...prev, row])
      },
      onReactionDelete: (row) => {
        seenReactionIds.current.delete(row.id)
        setReactions((prev) => prev.filter((r) => r.id !== row.id))
      },
      // Seul le salon "village" peut contenir des messages anonymes.
      onIdentity:
        channel === 'village'
          ? (row) => {
              if (seenIdentityIds.current.has(row.message_id)) return
              seenIdentityIds.current.add(row.message_id)
              setIdentities((prev) => ({ ...prev, [row.message_id]: { user_id: row.user_id, display_name: row.display_name } }))
            }
          : undefined,
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [gameId, channel])

  // useCallback (deps: gameId/channel seulement) : ChatPanel passe ces deux
  // fonctions à des lignes de message mémoïsées (React.memo, voir
  // MessageRow) — sans ça, une nouvelle référence de fonction à chaque
  // rendu de ChatPanel aurait invalidé le memo de CHAQUE ligne à CHAQUE
  // rendu, l'annulant complètement.
  const send = useCallback(
    async (content: string, replyTo?: string | null) => {
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
    },
    [gameId, channel]
  )

  // Pas de mise à jour optimiste locale : l'ajout ou le retrait réel dans
  // `reactions` vient de l'écho realtime (INSERT ou DELETE sur
  // chat_message_reactions), pas de cet appel — évite de dupliquer la
  // logique d'affichage groupé ici en plus de ChatPanel.tsx.
  const toggleReaction = useCallback(async (messageId: string, emoji: ReactionEmoji) => {
    const { error } = await supabase.rpc('toggle_chat_reaction', {
      p_message_id: messageId,
      p_emoji: emoji,
    })
    return error
  }, [])

  return { messages, identities, reactions, send, sending, toggleReaction }
}

/** Nombre de messages arrivés dans `channel` depuis qu'on ne le regarde plus
 * (`active=false`) — pour un petit badge sur l'onglet "Loups"/"Amoureux"
 * pendant qu'on lit un autre salon (ex. le village). Volontairement léger :
 * aucune souscription dédiée (écoute le canal partagé de lib/chatRealtime.ts), aucun historique
 * chargé (contrairement à useChat ci-dessus, monté seulement pour le salon
 * actif) — ne compte que les nouveaux messages reçus pendant que ce hook est
 * monté, pas l'historique antérieur. Remis à zéro dès que `active` repasse à
 * vrai (l'onglet vient d'être ouvert). */
export function useUnreadChatCount(gameId: string | null, channel: ChatChannel | null, active: boolean): number {
  const [count, setCount] = useState(0)
  const activeRef = useRef(active)

  useEffect(() => {
    activeRef.current = active
    if (active) setCount(0)
  }, [active])

  useEffect(() => {
    setCount(0)
    if (!gameId || !channel) return

    // Même canal partagé que useChat (voir lib/chatRealtime.ts) : plus
    // d'abonnement dédié par onglet, qui multipliait les vérifications de droits
    // côté base à chaque message.
    return subscribeChatEvents(gameId, {
      onMessage: (row) => {
        if (row.channel !== channel) return
        if (activeRef.current) return
        setCount((c) => c + 1)
      },
    })
  }, [gameId, channel])

  return count
}
