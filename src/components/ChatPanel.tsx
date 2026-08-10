import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import { useChat, type RevealedIdentity } from '../hooks/useChat'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { REACTION_EMOJIS, type ChatChannel, type ChatMessage, type ChatReaction, type ReactionEmoji } from '../types/game'

const CHANNEL_LABEL: Record<ChatChannel, { titleKey: TranslationKey; emoji: string; placeholderKey: TranslationKey }> = {
  village: { titleKey: 'chat.village.title', emoji: '💬', placeholderKey: 'chat.village.placeholder' },
  wolves: { titleKey: 'chat.wolves.title', emoji: '🐺', placeholderKey: 'chat.wolves.placeholder' },
  graveyard: { titleKey: 'chat.graveyard.title', emoji: '👻', placeholderKey: 'chat.graveyard.placeholder' },
}

// Référence stable partagée par tous les messages sans réaction — évite de
// créer un nouveau tableau `[]` à chaque rendu pour chacun d'eux (voir son
// usage plus bas), ce qui casserait sinon la mémoïsation de MessageRow pour
// la quasi-totalité des messages d'un salon peu réactif.
const EMPTY_REACTIONS: ChatReaction[] = []

const LONG_PRESS_MS = 450

// Mémoïsé : GameRoom.tsx re-rend périodiquement (voir useGame.ts, filet de
// sécurité qui re-synchronise l'état toutes les 2,5s même sans changement
// réel) — sans memo, chaque ChatPanel monté à ce moment-là (village + loups
// la nuit, ou village + cimetière côté fantôme) se re-rendrait entièrement à
// chaque fois, `messages.map(...)` compris, même sans la moindre activité
// dans le salon. Les props passées ici (gameId, channel, selfId, compact,
// readOnly, note) sont des primitives stables d'un rendu à l'autre — le
// comparateur par défaut de React.memo suffit, pas besoin d'un comparateur
// personnalisé.
export const ChatPanel = memo(function ChatPanel({
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
  // au-dessus du clavier (position: fixed, top/height recalculés en JS).
  // L'écoute resize/scroll de visualViewport n'est active QUE pendant la
  // frappe (dépendance [inputFocused] ci-dessous) : la brancher en
  // permanence faisait tourner un handler sur chaque scroll de la page,
  // même hors saisie, et re-rendait tout le panneau (donc toute la liste de
  // messages) à chaque fois — un coût significatif sur un salon très actif,
  // remonté comme un ralentissement général du chat sur mobile.
  const [inputFocused, setInputFocused] = useState(false)
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null)

  // Le passage en plein écran ne sert qu'à échapper au clavier virtuel
  // tactile — sur PC (souris/trackpad), `window.visualViewport` existe
  // pourtant aussi dans tous les navigateurs modernes, donc sans ce garde-fou
  // le simple fait de cliquer dans le champ faisait passer tout le chat en
  // plein écran alors qu'il n'y a aucun clavier à éviter. `pointer: coarse`
  // détecte un pointeur tactile (doigt) plutôt qu'un pointeur fin (souris) ;
  // calculé une seule fois, ce n'est pas censé changer pendant la session.
  const [isTouchDevice] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  )

  useEffect(() => {
    if (!inputFocused || !isTouchDevice) return
    const vv = window.visualViewport
    if (!vv) return
    // iOS déclenche resize/scroll sur visualViewport très souvent pendant la
    // frappe (barre de prédiction qui apparaît/disparaît selon le mot en
    // cours, micro-ajustements du clavier) — potentiellement plusieurs fois
    // par seconde en tapant vite. Deux garde-fous pour que ça reste léger :
    // 1) rAF pour ne traiter au plus qu'une mise à jour par frame au lieu
    //    d'une par évènement (les évènements peuvent arriver en rafale) ;
    // 2) ne pas appeler setState du tout si la valeur n'a pas réellement
    //    changé, pour ne pas déclencher un re-rendu (et la transition CSS
    //    qui l'accompagnait, voir plus bas) sans raison.
    let raf = 0
    let last = { height: -1, top: -1 }
    const update = () => {
      raf = 0
      const height = vv.height
      const top = vv.offsetTop
      if (height === last.height && top === last.top) return
      last = { height, top }
      setViewport({ height, top })
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(update)
    }
    update()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
    }
  }, [inputFocused, isTouchDevice])

  // true seulement pendant la frappe dans CE salon précis, et seulement sur
  // un appareil tactile (voir isTouchDevice ci-dessus) — sur PC, le champ
  // garde sa taille normale, aucun clavier virtuel ne vient jamais masquer
  // quoi que ce soit.
  const expanded = isTouchDevice && inputFocused && !!viewport

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
  // change, même logique que messagesById ci-dessus. Important pour la
  // mémoïsation de MessageRow : cette Map n'est reconstruite QUE si une
  // réaction change quelque part dans le salon (pas à chaque nouveau
  // message), donc `.get(id)` renvoie la MÊME référence de tableau pour
  // tous les messages non concernés — c'est ce qui permet à leur ligne de ne
  // pas se re-rendre quand un nouveau message arrive ailleurs dans la liste.
  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, ChatReaction[]>()
    for (const r of reactions) {
      const list = map.get(r.message_id)
      if (list) list.push(r)
      else map.set(r.message_id, [r])
    }
    return map
  }, [reactions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  // Tous les handlers passés à MessageRow sont mémoïsés (useCallback, deps
  // vides ou stables) : une ligne ne se re-rend que si SES propres props
  // changent, jamais parce que ChatPanel s'est re-rendu pour une autre
  // raison (nouveau message ailleurs, frappe dans le champ, etc.).
  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const beginLongPress = useCallback(
    (messageId: string) => {
      cancelLongPress()
      longPressTimer.current = setTimeout(() => {
        setMenuOpenFor(messageId)
        suppressNextClick.current = true
        // Léger retour haptique sur les appareils qui le supportent — pas
        // d'effet si l'API n'existe pas (desktop, iOS Safari).
        navigator.vibrate?.(15)
      }, LONG_PRESS_MS)
    },
    [cancelLongPress]
  )

  const handleBubbleClick = useCallback((messageId: string) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    // Un tap simple pendant que le menu de CE message est déjà ouvert le
    // referme — sinon un tap ailleurs ne fait rien de spécial (pas de
    // fermeture globale au clic extérieur, pour rester simple).
    setMenuOpenFor((cur) => (cur === messageId ? null : cur))
  }, [])

  const handleReply = useCallback((m: ChatMessage) => {
    setReplyTarget(m)
    setMenuOpenFor(null)
  }, [])

  return (
    <div
      style={
        expanded
          ? { position: 'fixed', left: 0, right: 0, top: viewport!.top, height: viewport!.height, zIndex: 60 }
          : undefined
      }
      // h-80→h-96 (voir retour utilisateur) : la carte de statut au-dessus
      // du chat pendant la nuit (WaitingCard, GameRoom.tsx) vient d'être
      // réduite pour lui laisser plus de place — le chat étant l'endroit
      // où se passe vraiment la partie, il doit rester la zone la plus
      // visible de l'écran.
      // h-96→h-[65vh] (retour utilisateur suivant : encore trop court sur
      // mobile, ~4 messages suffisaient à devoir défiler). Une hauteur
      // relative au viewport s'adapte mieux d'un téléphone à l'autre qu'une
      // valeur fixe en px — plafonnée à 30rem pour ne pas devenir démesurée
      // sur un grand écran desktop.
      // Pas de transition CSS sur la hauteur/position ici : en plein écran
      // (expanded), top/height sont recalculés à chaque évènement
      // visualViewport pendant la frappe (voir effet ci-dessus) — avec une
      // transition active, chaque mise à jour relançait 150ms d'animation
      // interpolée par le navigateur, et plusieurs de ces animations
      // pouvaient se chevaucher en tapant vite. C'était le principal
      // responsable des ralentissements ressentis "en utilisant beaucoup le
      // clavier" sur iPhone : coût de repaint répété pour une transition qui
      // n'apportait de toute façon aucun bénéfice visuel perceptible ici.
      className={`flex flex-col border border-night-600/60 ${
        expanded ? 'rounded-none bg-night-900/95' : `rounded-2xl bg-night-900/50 ${compact ? 'h-64' : 'h-[65vh] max-h-[30rem]'}`
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
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            selfId={selfId}
            identities={identities}
            repliedTo={m.reply_to_message_id ? messagesById.get(m.reply_to_message_id) : undefined}
            reactions={reactionsByMessage.get(m.id) ?? EMPTY_REACTIONS}
            menuOpen={menuOpenFor === m.id}
            readOnly={readOnly}
            touchActiveRef={touchActive}
            onBeginLongPress={beginLongPress}
            onCancelLongPress={cancelLongPress}
            onBubbleClick={handleBubbleClick}
            onToggleReaction={toggleReaction}
            onReply={handleReply}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {!readOnly && replyTarget && (
        <div className="flex items-center gap-2 border-t border-night-600/50 bg-night-800/50 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate text-moon-200/60">
            <span className="text-moon-300">{t('chat.replyingTo')}</span> {labelFor(replyTarget, identities, t)} —{' '}
            {replyTarget.content}
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
})

/** Même règle d'affichage du nom partout : auteur réel démasqué seulement si
 * la RLS de chat_message_identities nous y autorise (c'est notre propre
 * message, ou on est la Petite Fille vivante) — factorisée en dehors du
 * composant (pas de dépendance sur des hooks) pour être appelable aussi bien
 * depuis ChatPanel (aperçu de citation) que depuis MessageRow (bulle citée). */
function labelFor(
  m: ChatMessage,
  identities: Record<string, RevealedIdentity>,
  t: (key: TranslationKey) => string
): string {
  const identity = m.is_anonymous ? identities[m.id] : undefined
  const label = m.is_anonymous ? identity?.display_name ?? null : m.display_name
  if (m.is_anonymous) return label ? `🕵️ ${label}` : t('chat.anonymous')
  return label ?? t('common.playerFallback')
}

/** Une bulle de message + ses réactions/menu — mémoïsée (React.memo) pour
 * qu'un salon actif (beaucoup de messages/réactions) ne re-rende PAS chaque
 * ligne existante à chaque nouveau message : seule la ligne dont les props
 * ont réellement changé (nouveau message lui-même, ses propres réactions,
 * son propre menu ouvert/fermé) se re-rend. C'est ce point précis qui a été
 * identifié comme coûteux sur un salon très animé (retour utilisateur :
 * ralentissements sur mobile) — avant, `messages.map(...)` recréait tout à
 * chaque rendu de ChatPanel, quelle qu'en soit la cause. */
const MessageRow = memo(function MessageRow({
  message: m,
  selfId,
  identities,
  repliedTo,
  reactions,
  menuOpen,
  readOnly,
  touchActiveRef,
  onBeginLongPress,
  onCancelLongPress,
  onBubbleClick,
  onToggleReaction,
  onReply,
}: {
  message: ChatMessage
  selfId: string
  identities: Record<string, RevealedIdentity>
  repliedTo: ChatMessage | undefined
  reactions: ChatReaction[]
  menuOpen: boolean
  readOnly: boolean
  touchActiveRef: MutableRefObject<boolean>
  onBeginLongPress: (messageId: string) => void
  onCancelLongPress: () => void
  onBubbleClick: (messageId: string) => void
  onToggleReaction: (messageId: string, emoji: ReactionEmoji) => void
  onReply: (m: ChatMessage) => void
}) {
  const { t } = useLanguage()

  // Message anonyme (village, la nuit) : l'auteur réel n'est jamais présent
  // dans `m` elle-même (voir migration 0026) — seulement dans `identities`,
  // si la RLS de chat_message_identities nous autorise à le voir.
  const identity = m.is_anonymous ? identities[m.id] : undefined
  const isMine = m.is_anonymous ? identity?.user_id === selfId : m.user_id === selfId
  const label = m.is_anonymous ? identity?.display_name ?? null : m.display_name

  // Groupées par emoji pour l'affichage en pastilles (une par emoji utilisé,
  // avec le compte) plutôt qu'une réaction par ligne — même idée que
  // Slack/Discord. Autorisé même en `readOnly` (un fantôme qui suit le
  // village peut réagir sans pouvoir écrire, voir migration 0066 :
  // can_read_channel suffit côté serveur).
  const groupedReactions = REACTION_EMOJIS.map((emoji) => ({ emoji, entries: reactions.filter((r) => r.emoji === emoji) })).filter(
    (g) => g.entries.length > 0
  )

  return (
    <div className={`animate-fade-in text-sm ${isMine ? 'text-right' : ''}`}>
      {/* Réagir/répondre : appui long (tactile ou souris maintenue) sur la
          bulle elle-même plutôt que des boutons toujours visibles à côté —
          même logique que WhatsApp/Messenger. select-none + onContextMenu
          évite que le maintien du doigt ne déclenche la sélection de texte
          ou le menu contextuel natif du navigateur pendant l'appui. */}
      <span
        onTouchStart={() => {
          touchActiveRef.current = true
          onBeginLongPress(m.id)
        }}
        onTouchEnd={() => {
          onCancelLongPress()
          setTimeout(() => {
            touchActiveRef.current = false
          }, 400)
        }}
        onTouchMove={onCancelLongPress}
        onTouchCancel={() => {
          onCancelLongPress()
          touchActiveRef.current = false
        }}
        onMouseDown={() => {
          if (touchActiveRef.current) return
          onBeginLongPress(m.id)
        }}
        onMouseUp={onCancelLongPress}
        onMouseLeave={onCancelLongPress}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => onBubbleClick(m.id)}
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
            {repliedTo ? `${labelFor(repliedTo, identities, t)} — ${repliedTo.content}` : t('chat.repliedMessageUnavailable')}
          </span>
        )}
        {m.content}
      </span>

      {(groupedReactions.length > 0 || menuOpen) && (
        <div className={`mt-1 flex flex-wrap items-center gap-1 ${isMine ? 'justify-end' : ''}`}>
          {groupedReactions.map((g) => {
            const mine = g.entries.some((r) => r.user_id === selfId)
            return (
              <button
                key={g.emoji}
                type="button"
                onClick={() => onToggleReaction(m.id, g.emoji)}
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
          {menuOpen && (
            <div className="flex items-center gap-1.5 rounded-full border border-night-600/60 bg-night-800/80 px-2 py-1">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction(m.id, emoji)}
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
                    onClick={() => onReply(m)}
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
})

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
