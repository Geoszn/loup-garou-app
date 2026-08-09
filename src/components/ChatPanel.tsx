import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useChat } from '../hooks/useChat'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { REACTION_EMOJIS, type ChatChannel, type ChatMessage, type ChatReaction, type ReactionEmoji } from '../types/game'

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
  const { messages, identities, reactions, send, sending, toggleReaction } = useChat(gameId, channel)
  // Message dont le petit menu (réagir / répondre) est ouvert (au plus un à
  // la fois) — purement local à l'affichage, jamais persisté. Ouvert par un
  // appui long sur le message (voir handlers plus bas), pas par un bouton
  // visible en permanence : plus proche des habitudes WhatsApp/Messenger,
  // et libère l'espace autour de chaque bulle.
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  // Minuteur de l'appui long en cours (touch ou souris) — un seul à la fois,
  // annulé si le doigt/curseur bouge ou est relâché avant l'échéance.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Un "click" de souris fantôme suit toujours un touchend sur mobile : sans
  // ce garde-fou, le clic qui termine l'appui long rouvrirait/refermerait le
  // menu immédiatement après l'avoir ouvert.
  const suppressNextClick = useRef(false)
  // Évite qu'un touchstart déclenche AUSSI le onMouseDown correspondant
  // (même appareil, deux évènements pour un seul geste sur beaucoup de
  // navigateurs mobiles).
  const touchActive = useRef(false)
  // Message auquel on est en train de répondre (voir migration 0041) —
  // uniquement une référence à un message déjà chargé dans `messages`, pas
  // un état serveur : abandonné sans conséquence si on change d'onglet ou
  // recharge avant d'envoyer. Reste ici (pas dans <Composer>) car la bulle
  // "réponse à..." doit pouvoir être annulée depuis la liste des messages
  // ET depuis l'aperçu au-dessus du champ.
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const info = CHANNEL_LABEL[channel]

  // Quand le clavier virtuel est ouvert ET qu'on écrit dans CE salon, le
  // panneau passe en plein écran, calé exactement sur ce que
  // window.visualViewport rapporte comme espace RÉELLEMENT visible
  // au-dessus du clavier (position: fixed, top/height recalculés en JS —
  // pas juste une hauteur plus grande en flux normal). Avant, on se
  // contentait d'agrandir la hauteur du panneau et de faire un
  // scrollIntoView sur le champ : ça ne suffisait pas sur iOS Safari plus
  // ancien (avant le support d'interactive-widget=resizes-content, voir
  // index.html), où le clavier reste superposé par-dessus une page qui ne
  // rétrécit pas vraiment — le champ de saisie et une partie du chat se
  // retrouvaient cachés derrière malgré tout. Recalculer top/height en
  // continu (resize ET scroll : sur iOS, offsetTop bouge aussi si la page
  // défile pendant que le clavier est ouvert) garantit que le panneau colle
  // toujours pile au bord du clavier, quel que soit le navigateur.
  const [inputFocused, setInputFocused] = useState(false)
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setViewport({ height: vv.height, top: vv.offsetTop })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // true seulement pendant la frappe dans CE salon précis — les autres
  // ChatPanel éventuellement montés en même temps (ex. village + loups la
  // nuit) restent dans leur taille normale.
  const expanded = inputFocused && !!viewport

  // Index des messages par id, recalculé seulement quand `messages` change.
  // Avant, la citation d'un message (repliedTo) était retrouvée via
  // `messages.find(...)` directement dans `messages.map(...)`, donc en
  // O(n²) à chaque rendu. Un Map ramène chaque lookup à O(1).
  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  // Réactions groupées par message — recalculé seulement quand `reactions`
  // change, même logique que messagesById ci-dessus.
  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, ChatReaction[]>()
    for (const r of reactions) {
      const list = map.get(r.message_id)
      if (list) list.push(r)
      else map.set(r.message_id, [r])
    }
    return map
  }, [reactions])

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

  const LONG_PRESS_MS = 450

  function beginLongPress(messageId: string) {
    cancelLongPress()
    longPressTimer.current = setTimeout(() => {
      setMenuOpenFor(messageId)
      suppressNextClick.current = true
      // Léger retour haptique sur les appareils qui le supportent — pas
      // d'effet si l'API n'existe pas (desktop, iOS Safari).
      navigator.vibrate?.(15)
    }, LONG_PRESS_MS)
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleBubbleClick(messageId: string) {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    // Un tap simple pendant que le menu de CE message est déjà ouvert le
    // referme — sinon un tap ailleurs ne fait rien de spécial (pas de
    // fermeture globale au clic extérieur, pour rester simple).
    setMenuOpenFor((cur) => (cur === messageId ? null : cur))
  }

  return (
    <div
      style={
        expanded
          ? { position: 'fixed', left: 0, right: 0, top: viewport!.top, height: viewport!.height, zIndex: 60 }
          : undefined
      }
      className={`flex flex-col border border-night-600/60 transition-[height] duration-150 ${
        expanded ? 'rounded-none bg-night-900/95' : `rounded-2xl bg-night-900/50 ${compact ? 'h-64' : 'h-80'}`
      }`}
    >
      <div className="flex items-center gap-2 border-b border-night-600/50 px-4 py-2.5">
        <span>{info.emoji}</span>
        <span className="text-sm font-semibold text-moon-200">{t(info.titleKey)}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-moon-200/30">
          {readOnly ? t('chat.readOnly') : t('chat.live')}
        </span>
      </div>
      {note && <p className="border-b border-night-600/40 px-4 py-1.5 text-[11px] text-moon-200/40">{note}</p>}

      {/* Tapoter le fond vide de la liste (pas un message ni un bouton —
          voir la condition e.target === e.currentTarget) referme le clavier
          en plein écran, comme dans la plupart des apps de chat. */}
      <div
        className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-4 py-3"
        onClick={(e) => {
          if (expanded && e.target === e.currentTarget) (document.activeElement as HTMLElement | null)?.blur()
        }}
      >
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
          // Groupées par emoji pour l'affichage en pastilles (une par emoji
          // utilisé, avec le compte) plutôt qu'une réaction par ligne — même
          // idée que Slack/Discord. Autorisé même en `readOnly` (un fantôme
          // qui suit le village peut réagir sans pouvoir écrire, voir
          // migration 0066 : can_read_channel suffit côté serveur).
          const messageReactions = reactionsByMessage.get(m.id) ?? []
          const groupedReactions = REACTION_EMOJIS
            .map((emoji) => ({ emoji, entries: messageReactions.filter((r) => r.emoji === emoji) }))
            .filter((g) => g.entries.length > 0)

          return (
            <div key={m.id} className={`animate-fade-in text-sm ${isMine ? 'text-right' : ''}`}>
              {/* Réagir/répondre : appui long (tactile ou souris maintenue,
                  voir beginLongPress) sur la bulle elle-même plutôt que des
                  boutons toujours visibles à côté — même logique que
                  WhatsApp/Messenger. select-none + onContextMenu évite que le
                  maintien du doigt ne déclenche la sélection de texte ou le
                  menu contextuel natif du navigateur pendant l'appui. */}
              <span
                onTouchStart={() => {
                  touchActive.current = true
                  beginLongPress(m.id)
                }}
                onTouchEnd={() => {
                  cancelLongPress()
                  setTimeout(() => {
                    touchActive.current = false
                  }, 400)
                }}
                onTouchMove={cancelLongPress}
                onTouchCancel={() => {
                  cancelLongPress()
                  touchActive.current = false
                }}
                onMouseDown={() => {
                  if (touchActive.current) return
                  beginLongPress(m.id)
                }}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => handleBubbleClick(m.id)}
                className={`inline-block max-w-[85%] select-none break-words rounded-2xl px-3 py-1.5 text-left ${
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

              {(groupedReactions.length > 0 || menuOpenFor === m.id) && (
                <div className={`mt-1 flex flex-wrap items-center gap-1 ${isMine ? 'justify-end' : ''}`}>
                  {groupedReactions.map((g) => {
                    const mine = g.entries.some((r) => r.user_id === selfId)
                    return (
                      <button
                        key={g.emoji}
                        type="button"
                        onClick={() => toggleReaction(m.id, g.emoji)}
                        title={g.entries.map((r) => r.display_name).join(', ')}
                        className={`rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
                          mine
                            ? 'border-blood-500/60 bg-blood-700/20 text-moon-200'
                            : 'border-night-600/60 bg-night-800/60 text-moon-200/70 hover:border-moon-400/40'
                        }`}
                      >
                        {g.emoji} {g.entries.length}
                      </button>
                    )
                  })}
                  {menuOpenFor === m.id && (
                    <div className="flex items-center gap-1.5 rounded-full border border-night-600/60 bg-night-800/80 px-2 py-1">
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            toggleReaction(m.id, emoji)
                            setMenuOpenFor(null)
                          }}
                          className="text-sm leading-none transition-transform hover:scale-125"
                        >
                          {emoji}
                        </button>
                      ))}
                      {!readOnly && (
                        <>
                          <span className="h-4 w-px bg-night-600/60" />
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTarget(m)
                              setMenuOpenFor(null)
                            }}
                            title={t('chat.replyTo')}
                            className="whitespace-nowrap text-xs text-moon-200/70 transition-colors hover:text-moon-200"
                          >
                            ↩ {t('chat.replyTo')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
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

  // ChatPanel passe en plein écran calé sur window.visualViewport dès que ce
  // champ reçoit le focus (voir `expanded` dans ChatPanel) — le champ se
  // retrouve alors déjà à sa place, tout en bas de l'écran visible, sans
  // action supplémentaire ici. Seul filet de sécurité : un navigateur sans
  // API visualViewport (très ancien) ne peut pas passer en plein écran,
  // on retombe alors sur un simple scroll classique.
  function handleInputFocus() {
    onFocusChange(true)
    if (!window.visualViewport) {
      setTimeout(() => inputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 300)
    }
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
