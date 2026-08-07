import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useChat } from '../hooks/useChat'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import type { ChatChannel, ChatMessage } from '../types/game'

const CHANNEL_LABEL: Record<ChatChannel, { titleKey: TranslationKey; emoji: string; placeholderKey: TranslationKey }> = {
  village: { titleKey: 'chat.village.title', emoji: '💬', placeholderKey: 'chat.village.placeholder' },
  wolves: { titleKey: 'chat.wolves.title', emoji: '🐺', placeholderKey: 'chat.wolves.placeholder' },
  graveyard: { titleKey: 'chat.graveyard.title', emoji: '👻', placeholderKey: 'chat.graveyard.placeholder' },
}

export function ChatPanel({
  gameId,
  channel,
  selfId,
  compact = false,
  readOnly = false,
  note,
}: {
  gameId: string
  channel: ChatChannel
  selfId: string
  compact?: boolean
  /** Salon consultable mais pas écrit — utilisé par les fantômes qui
   * suivent le chat du village sans pouvoir y participer. Le serveur
   * refuse de toute façon l'écriture (can_access_channel), ceci ne fait
   * qu'éviter d'afficher un formulaire inutile. */
  readOnly?: boolean
  /** Petite note affichée sous l'en-tête (ex : rappel que le salon est
   * anonyme la nuit). */
  note?: string
}) {
  const { t } = useLanguage()
  const { messages, identities, send, sending } = useChat(gameId, channel)
  // Message auquel on est en train de répondre (voir migration 0041) —
  // uniquement une référence à un message déjà chargé dans `messages`, pas
  // un état serveur : abandonné sans conséquence si on change d'onglet ou
  // recharge avant d'envoyer. Reste ici (pas dans <Composer>) car la bulle
  // "réponse à..." doit pouvoir être annulée depuis la liste des messages
  // ET depuis l'aperçu au-dessus du champ.
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const info = CHANNEL_LABEL[channel]

  // Quand le clavier virtuel est ouvert ET qu'on écrit dans CE salon, on
  // agrandit temporairement la zone de messages pour profiter au maximum de
  // l'espace visible restant au-dessus du clavier. Sans ça, la hauteur fixe
  // (h-64/h-80) ne laisse voir que 2-3 messages pendant la frappe, ce qui
  // rend une conversation active illisible sur mobile (retour utilisateur :
  // le clavier "barre complètement la vue du jeu").
  const [inputFocused, setInputFocused] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setViewportHeight(vv.height)
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])

  const keyboardExpandedHeight =
    inputFocused && viewportHeight ? Math.max(220, Math.min(viewportHeight - 24, 560)) : null

  // Index des messages par id, recalculé seulement quand `messages` change.
  // Avant, la citation d'un message (repliedTo) était retrouvée via
  // `messages.find(...)` directement dans `messages.map(...)`, donc en
  // O(n²) à chaque rendu. Un Map ramène chaque lookup à O(1).
  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  // Même règle d'affichage du nom que dans le rendu des messages plus bas
  // (auteur réel démasqué seulement si la RLS de chat_message_identities
  // nous y autorise) — factorisée ici pour être réutilisée par l'aperçu de
  // citation au-dessus du champ de saisie ET par la bulle citée dans chaque
  // message qui répond à un autre.
  function labelFor(m: ChatMessage): string {
    const identity = m.is_anonymous ? identities[m.id] : undefined
    const label = m.is_anonymous ? identity?.display_name ?? null : m.display_name
    if (m.is_anonymous) return label ? `🕵️ ${label}` : t('chat.anonymous')
    return label ?? t('common.playerFallback')
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  return (
    <div
      style={keyboardExpandedHeight ? { height: `${keyboardExpandedHeight}px` } : undefined}
      className={`flex flex-col rounded-2xl border border-night-600/60 bg-night-900/50 transition-[height] duration-150 ${compact ? 'h-64' : 'h-80'}`}
    >
      <div className="flex items-center gap-2 border-b border-night-600/50 px-4 py-2.5">
        <span>{info.emoji}</span>
        <span className="text-sm font-semibold text-moon-200">{t(info.titleKey)}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-moon-200/30">
          {readOnly ? t('chat.readOnly') : t('chat.live')}
        </span>
      </div>
      {note && <p className="border-b border-night-600/40 px-4 py-1.5 text-[11px] text-moon-200/40">{note}</p>}

      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-4 py-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-moon-200/30">{t('chat.empty')}</p>
        )}
        {messages.map((m) => {
          // Message anonyme (village, la nuit) : l'auteur réel n'est jamais
          // présent dans `m` elle-même (voir migration 0026) — seulement
          // dans `identities`, si la RLS de chat_message_identities nous
          // autorise à le voir (c'est notre propre message, ou on est la
          // Petite Fille vivante).
          const identity = m.is_anonymous ? identities[m.id] : undefined
          const isMine = m.is_anonymous ? identity?.user_id === selfId : m.user_id === selfId
          const label = m.is_anonymous ? identity?.display_name ?? null : m.display_name
          // Le message cité n'est renvoyé que par référence (reply_to_message_id,
          // voir migration 0041) : on le retrouve parmi les messages déjà
          // chargés dans cette même fenêtre. S'il n'y est plus (paginé hors
          // des 200 derniers, ou salon rechargé depuis), on affiche un
          // repère générique plutôt que de masquer la citation.
          const repliedTo = m.reply_to_message_id ? messagesById.get(m.reply_to_message_id) : undefined

          return (
            <div key={m.id} className={`group animate-fade-in text-sm ${isMine ? 'text-right' : ''}`}>
              {/* Toujours visible (pas juste au survol group-hover) : sur
                  mobile il n'existe pas de "survol", un bouton caché derrière
                  un hover y serait tout simplement invisible et donc
                  intouchable. Opacité réduite par défaut, pleine au survol
                  sur les appareils qui le supportent (souris). */}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setReplyTarget(m)}
                  title={t('chat.replyTo')}
                  className="mx-1 align-middle text-xs text-moon-200/30 transition-colors hover:text-moon-300 active:text-moon-300"
                >
                  ↩
                </button>
              )}
              <span
                className={`inline-block max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-left ${
                  isMine
                    ? 'bg-blood-700/30 text-moon-200'
                    : m.is_anonymous
                      ? 'bg-night-800/70 text-moon-200/80'
                      : 'bg-night-700/60 text-moon-200/90'
                }`}
              >
                {!isMine && (
                  <span className="mr-1.5 text-xs font-semibold text-moon-300">
                    {m.is_anonymous ? (label ? `🕵️ ${label}` : t('chat.anonymous')) : label}
                  </span>
                )}
                {m.reply_to_message_id && (
                  <span className="mb-1 block truncate rounded-lg border-l-2 border-moon-400/40 bg-black/15 px-2 py-1 text-xs text-moon-200/50">
                    {repliedTo ? `${labelFor(repliedTo)} — ${repliedTo.content}` : t('chat.repliedMessageUnavailable')}
                  </span>
                )}
                {m.content}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {!readOnly && replyTarget && (
        <div className="flex items-center gap-2 border-t border-night-600/50 bg-night-800/50 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate text-moon-200/60">
            <span className="text-moon-300">{t('chat.replyingTo')}</span> {labelFor(replyTarget)} — {replyTarget.content}
          </span>
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className="shrink-0 text-moon-200/40 transition-colors hover:text-moon-200"
          >
            ✕
          </button>
        </div>
      )}

      {!readOnly && (
        <Composer
          placeholder={t(info.placeholderKey)}
          sending={sending}
          replyToId={replyTarget?.id ?? null}
          onSent={() => setReplyTarget(null)}
          send={send}
          onFocusChange={setInputFocused}
        />
      )}
    </div>
  )
}

/** Champ de saisie isolé dans son propre composant, avec son propre état
 * `text` — plutôt que de le garder dans ChatPanel comme avant. Sinon,
 * chaque frappe au clavier (état `text` changé) redéclenchait un rendu de
 * TOUT ChatPanel, `messages.map(...)` compris : sur un salon avec beaucoup
 * de messages, ça pouvait suffire à faire sentir la frappe en retard,
 * surtout sur mobile. Ici, taper ne re-rend plus que ce petit composant —
 * la liste des messages au-dessus n'est plus jamais concernée par la frappe. */
function Composer({
  placeholder,
  sending,
  replyToId,
  onSent,
  send,
  onFocusChange,
}: {
  placeholder: string
  sending: boolean
  replyToId: string | null
  onSent: () => void
  send: (content: string, replyTo?: string | null) => Promise<unknown>
  onFocusChange: (focused: boolean) => void
}) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Le clavier virtuel met un petit moment à s'ouvrir sur mobile : le
  // scroll-vers-l'input automatique du navigateur (déclenché par le focus)
  // vise parfois une position obsolète, calculée avant que le clavier n'ait
  // fini de rétrécir la fenêtre visible — l'input se retrouve alors caché
  // derrière. On refait un scrollIntoView une fois le clavier réellement
  // ouvert (évènement resize du visualViewport), en plus du comportement
  // natif du navigateur au focus. Alignement 'end' (plutôt que 'center')
  // pour coller le champ tout en bas de l'espace visible restant, juste
  // au-dessus du clavier — ça laisse le maximum de place possible aux
  // messages affichés au-dessus (voir aussi l'agrandissement du panneau
  // dans ChatPanel, piloté par le même évènement de focus).
  function handleInputFocus() {
    onFocusChange(true)
    const vv = window.visualViewport
    if (!vv) return
    let done = false
    const scrollNow = () => {
      if (done) return
      done = true
      inputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
    vv.addEventListener('resize', scrollNow, { once: true })
    // Filet de sécurité si le clavier était déjà ouvert (pas de resize à
    // venir) ou si le navigateur ne redéclenche pas l'évènement à temps.
    setTimeout(scrollNow, 400)
  }

  function handleInputBlur() {
    onFocusChange(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || sending) return
    const value = text
    setText('')
    onSent()
    await send(value, replyToId)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-night-600/50 p-2.5">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        maxLength={500}
        className="min-w-0 flex-1 rounded-xl border border-night-600 bg-night-800/70 px-3 py-2 text-[16px] text-moon-200 outline-none placeholder:text-moon-200/30 focus:border-moon-400/50 sm:text-sm"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        // Fond rouge fixe, non lié au thème jour/nuit : texte clair fixe
        // aussi (voir la même correction sur VoteRecapModal).
        className="rounded-xl bg-blood-600 px-3 py-2 text-sm font-semibold text-[#fdf6e3] disabled:opacity-30"
      >
        ➤
      </button>
    </form>
  )
}
