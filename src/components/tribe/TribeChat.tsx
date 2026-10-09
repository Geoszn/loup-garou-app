import { createPortal } from 'react-dom'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import type { TranslationKey } from '../../i18n/translations'
import { TRIBE_MESSAGE_MAX, TRIBE_REACTIONS, isChatMuted, type TribeInfo, type TribeMember, type TribeMessage, type TribeMessageReaction } from '../../lib/tribe'
import { Avatar } from '../Avatar'
import { RoleBadge } from './TribeBits'
import { Sticker } from './Sticker'
import { useMyAvatarConfig } from '../AvatarEditor'
import { STICKER_PACK_ME, stickerById } from '../../lib/stickers'
import { TribeShield } from './TribeShield'
import { notifyTribeSummaryChanged } from '../../hooks/useTribeSummary'
import { useNoPinchZoom } from '../../hooks/useNoPinchZoom'
import { notifyTribeMessage, notifyTribeReaction } from '../../lib/pushSubscription'

const POLL_MS = 12000
const PAGE = 100
const LONG_PRESS_MS = 450
const SWIPE_REPLY_PX = 56
const GROUP_MS = 5 * 60 * 1000
const NAME_COLORS = ['text-amber-300', 'text-sky-300', 'text-emerald-300', 'text-pink-300', 'text-violet-300', 'text-orange-300', 'text-teal-300']

const colorOf = (id: string | null) => {
  let h = 0
  for (const ch of id ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return NAME_COLORS[h % NAME_COLORS.length]
}

/** Mots qui préviennent toute la tribu (chef et sous-chefs seulement, vérifié côté serveur). */
const EVERYONE_TAGS = ['everyone', 'tous']

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Le texte d'un message, avec les @pseudo des membres mis en évidence (doré pour moi). */
function renderBody(body: string, names: string[], me: string | undefined): ReactNode {
  if (!body.includes('@')) return body
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])@(${[...names, ...EVERYONE_TAGS].map(escapeRe).join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  const out: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(body))) {
    const start = match.index + match[1].length
    if (start > last) out.push(body.slice(last, start))
    const mine = (!!me && match[2].toLowerCase() === me.toLowerCase()) || EVERYONE_TAGS.includes(match[2].toLowerCase())
    out.push(
      <span key={start} className={`rounded px-1 font-semibold ${mine ? 'bg-amber-300/25 text-amber-200' : 'bg-sky-400/20 text-sky-200'}`}>
        @{match[2]}
      </span>,
    )
    last = start + 1 + match[2].length
  }
  if (last === 0) return body
  if (last < body.length) out.push(body.slice(last))
  return out
}

/** Hauteur réellement visible : elle rétrécit quand le clavier s'ouvre, ce qui permet de
 * garder le champ de saisie collé au-dessus du clavier sans que la page ne bouge. */
function useVisualViewport() {
  const read = () => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    top: window.visualViewport?.offsetTop ?? 0,
    full: window.innerHeight,
  })
  const [vv, setVv] = useState(read)
  useEffect(() => {
    const update = () => setVv(read())
    const v = window.visualViewport
    v?.addEventListener('resize', update)
    v?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      v?.removeEventListener('resize', update)
      v?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return vv
}

/** Fusionne la fenêtre la plus récente (relue régulièrement) avec les messages plus anciens déjà chargés. */
function mergeLatest(prev: TribeMessage[], fresh: TribeMessage[]): TribeMessage[] {
  if (fresh.length < PAGE || prev.length === 0) return fresh
  const first = new Date(fresh[0].created_at).getTime()
  const ids = new Set(fresh.map((m) => m.id))
  return [...prev.filter((m) => !ids.has(m.id) && new Date(m.created_at).getTime() < first), ...fresh]
}

/**
 * Le chat de la tribu, en plein écran façon messagerie : un en-tête, la liste des
 * messages qui défile seule, et le champ de saisie fixé en bas (il remonte avec le
 * clavier, la page ne bouge pas). On peut répondre (bouton, glissement vers la droite)
 * — toucher une citation ramène au message d'origine — et réagir avec les mêmes 6 emoji
 * que le chat des parties (appui long sur un message, appui long sur une pastille pour
 * voir qui a réagi).
 *
 * Branché en direct SEULEMENT pendant que le chat est ouvert (un canal Realtime par
 * tribu, fermé en quittant), avec une relecture de sécurité toutes les 12 s tant que
 * l'écran est visible. Le serveur ne garde que les 200 derniers messages.
 */
export function TribeChat({ tribe, members, onBack, onlineCount, memberCount }: { tribe: TribeInfo; members: TribeMember[]; onBack: () => void; onlineCount: number | null; memberCount: number }) {
  const { t, lang } = useLanguage()
  const { user, profile } = useAuth()
  const vv = useVisualViewport()
  const [messages, setMessages] = useState<TribeMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [replyTo, setReplyTo] = useState<TribeMessage | null>(null)
  const [stickersOpen, setStickersOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  // Pseudos des membres (les plus longs d'abord) pour reconnaître les @mentions dans un message.
  const mentionNames = useMemo(() => members.map((x) => x.username).filter(Boolean).sort((a, b) => b.length - a.length), [members])
  const messagesRef = useRef<TribeMessage[]>([])
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('lg-tribe-sticker-recents') ?? '[]')
      return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && !!stickerById(id)).slice(0, 8) : []
    } catch {
      return []
    }
  })
  const myAvatar = useMyAvatarConfig()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [namesFor, setNamesFor] = useState<{ id: string; emoji: string } | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [reported, setReported] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const lastReadRef = useRef(0)
  const lastIdRef = useRef<string | null>(null)
  const anchorRef = useRef<{ height: number; top: number } | null>(null)
  const pendingJumpRef = useRef<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const muted = !!tribe.muted_until && new Date(tribe.muted_until).getTime() > Date.now()
  const isManager = tribe.my_role === 'chef' || tribe.my_role === 'sous_chef'
  const keyboardOpen = vv.full - vv.height > 150

  const showToast = useCallback((text: string) => {
    setToast(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  // Le chat occupe tout l'écran, FIXE comme une messagerie : la page derrière ne défile pas et
  // le pincement ne zoome pas.
  useNoPinchZoom()
  useEffect(() => {
    const html = document.documentElement
    const prevHtml = html.style.overflow
    const prevBody = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtml
      document.body.style.overflow = prevBody
    }
  }, [])

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_tribe_messages', { p_before: null, p_limit: PAGE })
    if (rpcError || !Array.isArray(data)) return
    const fresh = data as TribeMessage[]
    setMessages((prev) => mergeLatest(prev, fresh))
    if (fresh.length < PAGE) setHasMore(false)
    setLoaded(true)
    if (Date.now() - lastReadRef.current > 4000) {
      lastReadRef.current = Date.now()
      // Lu : la pastille « non lus » (barre du bas, accueil) se remet à jour.
      void Promise.resolve(supabase.rpc('mark_tribe_read')).then(() => notifyTribeSummaryChanged())
    }
  }, [])

  messagesRef.current = messages

  const loadOlder = useCallback(async (): Promise<boolean> => {
    const oldest = messages[0]
    if (!oldest) return false
    const { data, error: rpcError } = await supabase.rpc('get_tribe_messages', { p_before: oldest.created_at, p_limit: PAGE })
    if (rpcError || !Array.isArray(data)) return false
    const older = data as TribeMessage[]
    if (older.length < PAGE) setHasMore(false)
    if (older.length === 0) return false
    const el = listRef.current
    if (el) anchorRef.current = { height: el.scrollHeight, top: el.scrollTop }
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id))
      return [...older.filter((m) => !ids.has(m.id)), ...prev]
    })
    return true
  }, [messages])

  useEffect(() => {
    void load()
    let timer: ReturnType<typeof setTimeout> | null = null
    const refetchSoon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void load(), 250 + Math.random() * 400)
    }
    const channel = supabase
      .channel(`tribe-chat-${tribe.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tribe_messages', filter: `tribe_id=eq.${tribe.id}` }, refetchSoon)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tribe_message_reactions', filter: `tribe_id=eq.${tribe.id}` }, refetchSoon)
      .subscribe()
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [tribe.id, load])

  // Après l'ajout de messages plus anciens en haut, on garde la lecture au même endroit.
  useLayoutEffect(() => {
    const el = listRef.current
    const a = anchorRef.current
    if (el && a) {
      el.scrollTop = a.top + (el.scrollHeight - a.height)
      anchorRef.current = null
    }
  }, [messages])

  // Reste en bas quand un message arrive (sauf si l'on a remonté l'historique, auquel cas
  // on propose le bouton « dernier message »).
  useEffect(() => {
    const el = listRef.current
    const last = messages[messages.length - 1]
    if (!el || !last) return
    const isNew = lastIdRef.current !== null && lastIdRef.current !== last.id
    if (stickRef.current || last.user_id === user?.id) {
      el.scrollTop = el.scrollHeight
      stickRef.current = true
    } else if (isNew) {
      setNewCount((n) => n + 1)
    }
    lastIdRef.current = last.id
  }, [messages, user?.id])

  // Le clavier s'ouvre ou se ferme : on reste collé au dernier message.
  useEffect(() => {
    const el = listRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [vv.height])

  // Saut vers un message précis (réponse citée) une fois qu'il est affiché.
  useEffect(() => {
    const id = pendingJumpRef.current
    if (!id) return
    const row = document.getElementById(`tm-${id}`)
    if (!row) return
    pendingJumpRef.current = null
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlight(id)
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1800)
  }, [messages])

  const jumpTo = useCallback(
    async (id: string | null | undefined) => {
      if (!id) {
        showToast(t('tribe.chat.originalGone'))
        return
      }
      const row = document.getElementById(`tm-${id}`)
      if (row) {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setHighlight(id)
        setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1800)
        return
      }
      pendingJumpRef.current = id
      const got = hasMore ? await loadOlder() : false
      setTimeout(
        () => {
          if (pendingJumpRef.current === id) {
            pendingJumpRef.current = null
            showToast(t('tribe.chat.originalGone'))
          }
        },
        got ? 600 : 50,
      )
    },
    [hasMore, loadOlder, showToast, t],
  )

  const scrollToBottom = () => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    stickRef.current = true
    setNewCount(0)
  }

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const me = user?.id
      if (!me) return
      const wasMine = (messagesRef.current.find((x) => x.id === messageId)?.reactions ?? []).some((r) => r.user_id === me && r.emoji === emoji)
      // Affichage immédiat, puis relecture pour se recaler sur le serveur.
      setMessages((list) =>
        list.map((m) => {
          if (m.id !== messageId) return m
          const rs = m.reactions ?? []
          const mine = rs.some((r) => r.user_id === me && r.emoji === emoji)
          const next: TribeMessageReaction[] = mine ? rs.filter((r) => !(r.user_id === me && r.emoji === emoji)) : [...rs, { emoji, user_id: me, username: profile?.username ?? null }]
          return { ...m, reactions: next }
        }),
      )
      const { error: rpcError } = await supabase.rpc('toggle_tribe_reaction', { p_message_id: messageId, p_emoji: emoji })
      if (rpcError) showToast(rpcError.message)
      else if (!wasMine) void notifyTribeReaction()
      void load()
    },
    [user?.id, profile?.username, load, showToast],
  )

  const remove = useCallback(
    async (id: string) => {
      setMessages((list) => list.filter((m) => m.id !== id))
      const { error: rpcError } = await supabase.rpc('delete_tribe_message', { p_message_id: id })
      if (rpcError) showToast(rpcError.message)
    },
    [showToast],
  )

  const report = useCallback(
    async (id: string) => {
      const { error: rpcError } = await supabase.rpc('report_tribe_message', { p_message_id: id })
      if (rpcError) showToast(rpcError.message)
      else {
        setReported((s) => new Set(s).add(id))
        showToast(t('tribe.chat.reported'))
      }
    },
    [showToast, t],
  )

  const copy = useCallback(
    async (m: TribeMessage) => {
      try {
        await navigator.clipboard.writeText(m.body ?? '')
        showToast(t('tribe.chat.copied'))
      } catch {
        // Presse-papiers indisponible : rien à faire.
      }
    },
    [showToast, t],
  )

  const startReply = useCallback((m: TribeMessage) => {
    setMenuFor(null)
    setReplyTo(m)
  }, [])

  const sendSticker = useCallback(
    async (id: string) => {
      setStickersOpen(false)
      const { error: rpcError } = await supabase.rpc('send_tribe_sticker', { p_sticker: id, p_reply_to: replyTo?.id ?? null })
      if (rpcError) {
        showToast(rpcError.message)
        return
      }
      setReplyTo(null)
      stickRef.current = true
      void notifyTribeMessage()
      setRecents((list) => {
        const next = [id, ...list.filter((x) => x !== id)].slice(0, 8)
        try {
          localStorage.setItem('lg-tribe-sticker-recents', JSON.stringify(next))
        } catch {
          // Stockage indisponible : les récents ne seront simplement pas gardés.
        }
        return next
      })
      void load()
    },
    [replyTo?.id, showToast, load],
  )

  const locale = lang === 'en' ? 'en-GB' : 'fr-FR'
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const dayOf = useCallback((iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }), [locale])

  const menuMessage = menuFor ? messages.find((m) => m.id === menuFor) ?? null : null

  // Les clics hors d'une pastille ferment la carte « qui a réagi ».
  useEffect(() => {
    if (!namesFor) return
    const close = () => setNamesFor(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [namesFor])

  const rows = useMemo(
    () =>
      messages.map((m, i) => {
        const prev = messages[i - 1]
        const next = messages[i + 1]
        const showDay = i === 0 || dayOf(prev.created_at) !== dayOf(m.created_at)
        const groupStart = showDay || prev.kind !== 'user' || prev.user_id !== m.user_id || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_MS
        const groupEnd = !next || next.kind !== 'user' || next.user_id !== m.user_id || new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > GROUP_MS || dayOf(next.created_at) !== dayOf(m.created_at)
        return { m, showDay, groupStart, groupEnd }
      }),
    [messages, dayOf],
  )

  // Posé à la racine du document : la page « Tribu » a son propre empilement, qui laisserait
  // la barre du bas passer par-dessus le champ de saisie.
  return createPortal(
    <div className="fixed inset-x-0 z-[45] flex flex-col bg-night-950" style={{ top: vv.top, height: vv.height, touchAction: 'pan-x pan-y' }}>
      {/* en-tête */}
      <div className="shrink-0 border-b border-night-600/60 bg-night-900 px-2 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}>
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <button type="button" onClick={onBack} aria-label={t('tribe.chat.back')} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-moon-200 active:bg-night-800">
            ‹
          </button>
          <TribeShield emblem={tribe.emblem} color={tribe.color} className="h-9 w-9 text-base" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base leading-tight text-moon-200">{tribe.name}</p>
            <p className="truncate text-[11px] text-moon-200/55">
              {onlineCount !== null && <span className="text-emerald-400">● {t('tribe.online', { n: onlineCount })} · </span>}
              {t('tribe.members.count', { n: memberCount, max: tribe.max })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            aria-label={t('tribe.notif.title')}
            title={t('tribe.notif.title')}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg active:bg-night-800 ${tribe.archived ? 'text-amber-300' : isChatMuted(tribe) ? 'text-moon-200/50' : 'text-moon-200'}`}
          >
            <span aria-hidden="true">{tribe.archived ? '📦' : isChatMuted(tribe) ? '🔕' : '🔔'}</span>
          </button>
        </div>
        {tribe.archived && (
          <div className="mx-auto mt-2 flex w-full max-w-3xl items-center justify-between gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            <span>📦 {t('tribe.notif.archived')}</span>
            <button
              type="button"
              onClick={async () => {
                await supabase.rpc('set_tribe_chat_prefs', { p_mute: 'keep', p_replies: tribe.notif_replies ?? true, p_archived: false })
                notifyTribeSummaryChanged()
              }}
              className="shrink-0 rounded-lg border border-amber-300/40 px-2.5 py-1 font-semibold"
            >
              {t('tribe.notif.unarchive')}
            </button>
          </div>
        )}
      </div>

      {/* messages */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            stickRef.current = near
            setAtBottom(near)
            if (near) setNewCount(0)
          }}
          className="flex h-full flex-col overflow-y-auto overscroll-contain px-2.5 py-3 [-webkit-overflow-scrolling:touch] md:px-[max(0.625rem,calc((100%_-_48rem)/2))]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        >
          {hasMore && messages.length >= PAGE && (
            <button type="button" onClick={() => void loadOlder()} className="mx-auto mb-3 shrink-0 rounded-full bg-night-800/90 px-3 py-1.5 text-[11px] text-moon-200/70">
              {t('tribe.chat.older')}
            </button>
          )}
          {loaded && messages.length === 0 && <p className="m-auto text-center text-sm text-moon-200/40">{t('tribe.chat.empty')}</p>}
          {rows.map(({ m, showDay, groupStart, groupEnd }) => (
            <div
              key={m.id}
              id={`tm-${m.id}`}
              className={`shrink-0 rounded-xl ${groupStart ? 'mt-2.5' : 'mt-1'} ${highlight === m.id ? 'tribe-anim' : ''}`}
              style={highlight === m.id ? { animation: 'tribe-flash 1.8s ease-in-out' } : undefined}
            >
              {showDay && <p className="mx-auto mb-2 w-fit rounded-full bg-night-800/80 px-3 py-1 text-[10px] capitalize text-moon-200/50">{dayOf(m.created_at)}</p>}
              {m.kind === 'system' ? (
                <p className="mx-auto w-fit max-w-[90%] rounded-full bg-night-800/60 px-3 py-1 text-center text-[11px] text-moon-200/55">
                  {t(`tribe.event.${m.event}` as TranslationKey, { actor: m.actor_name ?? '?', target: m.target_name ?? '?' })}
                </p>
              ) : (
                <Message
                  m={m}
                  mine={m.user_id === user?.id}
                  selfId={user?.id}
                  groupStart={groupStart}
                  groupEnd={groupEnd}
                  time={timeOf(m.created_at)}
                  namesFor={namesFor?.id === m.id ? namesFor.emoji : null}
                  onMenu={setMenuFor}
                  onReply={startReply}
                  onJump={jumpTo}
                  onReact={toggleReaction}
                  onNames={setNamesFor}
                  formerLabel={t('tribe.formerMember')}
                  youLabel={t('tribe.chat.you')}
                  goneLabel={t('tribe.chat.originalGone')}
                  mentionNames={mentionNames}
                  myName={profile?.username}
                />
              )}
            </div>
          ))}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label={t('tribe.chat.toBottom')}
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border border-night-500 bg-night-800 text-lg text-moon-200 shadow-lg"
          >
            ⌄
            {newCount > 0 && <span className="absolute -top-2 right-0 min-w-5 rounded-full bg-blood-500 px-1 text-center text-[10px] font-bold leading-5 text-[#fdf6e3]">{newCount}</span>}
          </button>
        )}
        {toast && <p className="pointer-events-none absolute inset-x-6 bottom-3 mx-auto w-fit max-w-full rounded-full bg-black/80 px-4 py-2 text-center text-xs text-moon-200">{toast}</p>}
      </div>

      {/* saisie */}
      <div className="shrink-0 border-t border-night-600/60 bg-night-900" style={{ paddingBottom: keyboardOpen ? 6 : 'max(env(safe-area-inset-bottom), 6px)' }}>
       <div className="mx-auto w-full max-w-3xl">
        {muted ? (
          <p className="px-3 py-3 text-center text-xs text-moon-200/60">{t('tribe.chat.muted')}</p>
        ) : (
          <>
            {stickersOpen && (
              <StickerPanel
                recents={recents}
                avatarConfig={myAvatar.config}
                avatarIcon={profile?.avatar_icon}
                name={profile?.username}
                onPick={(id) => void sendSticker(id)}
              />
            )}
            <Composer
              members={members}
              selfId={user?.id}
              replyTo={replyTo}
              stickersOpen={stickersOpen}
              onToggleStickers={() => setStickersOpen((o) => !o)}
              onCancelReply={() => setReplyTo(null)}
              onJump={jumpTo}
              onSent={() => {
                setReplyTo(null)
                stickRef.current = true
                void notifyTribeMessage()
                void load()
              }}
              onError={showToast}
            />
          </>
        )}
       </div>
      </div>

      {notifOpen && <NotifSheet tribe={tribe} onClose={() => setNotifOpen(false)} />}

      {/* menu d'un message (appui long) */}
      {menuMessage && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/60 px-6 backdrop-blur-[2px]" onClick={() => setMenuFor(null)}>
          <div className="flex items-center gap-1 rounded-full border border-night-600 bg-night-800 px-2.5 py-1.5 shadow-card" onClick={(e) => e.stopPropagation()}>
            {TRIBE_REACTIONS.map((emoji) => {
              const mine = (menuMessage.reactions ?? []).some((r) => r.user_id === user?.id && r.emoji === emoji)
              return (
                <button
                  key={emoji}
                  type="button"
                  disabled={muted}
                  onClick={() => {
                    setMenuFor(null)
                    void toggleReaction(menuMessage.id, emoji)
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-2xl transition-transform active:scale-125 disabled:opacity-40 ${mine ? 'bg-moon-400/25' : ''}`}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
          <div className="max-h-28 w-full max-w-sm overflow-hidden rounded-2xl bg-night-800/90 px-3 py-2 text-sm text-moon-200/80" onClick={(e) => e.stopPropagation()}>
            {menuMessage.sticker ? <p>🎭 {t('tribe.chat.stickerLabel')}</p> : <p className="line-clamp-4 whitespace-pre-wrap break-words">{menuMessage.body}</p>}
          </div>
          <div className="w-full max-w-sm divide-y divide-night-600/60 overflow-hidden rounded-2xl border border-night-600 bg-night-800 shadow-card" onClick={(e) => e.stopPropagation()}>
            {!muted && (
              <MenuItem onClick={() => startReply(menuMessage)}>
                <span aria-hidden="true">↩</span> {t('tribe.chat.reply')}
              </MenuItem>
            )}
            {!menuMessage.sticker && (
              <MenuItem
                onClick={() => {
                  setMenuFor(null)
                  void copy(menuMessage)
                }}
              >
                <span aria-hidden="true">📋</span> {t('tribe.chat.copy')}
              </MenuItem>
            )}
            {menuMessage.user_id !== user?.id && !reported.has(menuMessage.id) && (
              <MenuItem
                onClick={() => {
                  setMenuFor(null)
                  void report(menuMessage.id)
                }}
              >
                <span aria-hidden="true">🚩</span> {t('tribe.chat.report')}
              </MenuItem>
            )}
            {(isManager || menuMessage.user_id === user?.id) && (
              <MenuItem
                danger
                onClick={() => {
                  setMenuFor(null)
                  void remove(menuMessage.id)
                }}
              >
                <span aria-hidden="true">🗑️</span> {t('tribe.chat.delete')}
              </MenuItem>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

/** Panneau des stickers, au-dessus du champ de saisie : « Récents » puis le pack « Moi ». Un
 * toucher envoie le sticker tout de suite. */
function StickerPanel({ recents, avatarConfig, avatarIcon, name, onPick }: { recents: string[]; avatarConfig: unknown; avatarIcon?: string | null; name?: string; onPick: (id: string) => void }) {
  const { t } = useLanguage()
  const recentDefs = recents.map((id) => stickerById(id)).filter((d): d is NonNullable<typeof d> => !!d)
  const grid = (defs: typeof STICKER_PACK_ME) => (
    <div className="grid grid-cols-4 justify-items-center gap-x-1 gap-y-3">
      {defs.map((d) => (
        <button key={d.id} type="button" onClick={() => onPick(d.id)} className="rounded-xl p-0.5 transition-transform active:scale-90">
          <Sticker def={d} avatarConfig={avatarConfig} avatarIcon={avatarIcon} name={name} size={72} />
        </button>
      ))}
    </div>
  )
  return (
    <div className="max-h-[42vh] overflow-y-auto overscroll-contain border-b border-night-600/60 bg-night-900 px-3 py-3">
      {recentDefs.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-moon-200/50">{t('tribe.chat.stickersRecent')}</p>
          {grid(recentDefs)}
        </div>
      )}
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-moon-200/50">{t('tribe.chat.stickersMe')}</p>
      {grid(STICKER_PACK_ME)}
    </div>
  )
}

/** Réglages du chat : notifications activées ou silencieuses (1 h, 8 h, 1 semaine, toujours), alerte
 * pour les réponses malgré le silence, et archivage. Chaque choix s'enregistre tout de suite. */
function NotifSheet({ tribe, onClose }: { tribe: TribeInfo; onClose: () => void }) {
  const { t, lang } = useLanguage()
  const [mutedUntil, setMutedUntil] = useState<string | null>(tribe.notif_muted_until ?? null)
  const [replies, setReplies] = useState(tribe.notif_replies ?? true)
  const [archived, setArchived] = useState(!!tribe.archived)
  const [quietOn, setQuietOn] = useState(tribe.quiet_enabled ?? true)
  const [quietStart, setQuietStart] = useState(tribe.quiet_start ?? 22)
  const [quietEnd, setQuietEnd] = useState(tribe.quiet_end ?? 8)
  const [error, setError] = useState<string | null>(null)
  const muted = isChatMuted({ notif_muted_until: mutedUntil })
  const devicePrompt = typeof Notification !== 'undefined' && Notification.permission !== 'granted'

  async function save(mute: 'keep' | 'off' | '1h' | '8h' | '1w' | 'always', nextReplies = replies, nextArchived = archived) {
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('set_tribe_chat_prefs', { p_mute: mute, p_replies: nextReplies, p_archived: nextArchived })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    const result = data as { notif_muted_until: string | null } | null
    if (result) setMutedUntil(result.notif_muted_until ?? null)
    notifyTribeSummaryChanged()
  }

  async function saveQuiet(enabled: boolean, start: number, end: number) {
    setError(null)
    setQuietOn(enabled)
    setQuietStart(start)
    setQuietEnd(end)
    const { error: rpcError } = await supabase.rpc('set_chat_quiet_hours', { p_enabled: enabled, p_start: start, p_end: end, p_tz: -new Date().getTimezoneOffset() })
    if (rpcError) setError(rpcError.message)
    else notifyTribeSummaryChanged()
  }

  const options: { id: 'off' | '1h' | '8h' | '1w' | 'always'; label: string; active: boolean }[] = [
    { id: 'off', label: t('tribe.notif.on'), active: !muted },
    { id: '1h', label: t('tribe.notif.m1h'), active: false },
    { id: '8h', label: t('tribe.notif.m8h'), active: false },
    { id: '1w', label: t('tribe.notif.m1w'), active: false },
    { id: 'always', label: t('tribe.notif.always'), active: muted && mutedUntil === 'infinity' },
  ]
  const until = muted && mutedUntil && mutedUntil !== 'infinity' ? new Date(mutedUntil).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-t-3xl border border-night-600 bg-night-900 p-4 shadow-card md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="font-display text-lg text-moon-200">🔔 {t('tribe.notif.title')}</p>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-9 w-9 items-center justify-center rounded-full text-moon-200/60 active:bg-night-800">
            ✕
          </button>
        </div>
        {muted && <p className="mb-2 rounded-xl bg-night-800 px-3 py-2 text-xs text-amber-200">🔕 {until ? t('tribe.notif.mutedUntil', { time: until }) : t('tribe.notif.mutedAlways')}</p>}
        <div className="flex flex-col gap-1.5">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => void save(o.id)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${o.active ? 'border-moon-400/60 bg-moon-400/10 text-moon-200' : 'border-night-600/60 bg-night-800/60 text-moon-200/80'}`}
            >
              <span>{o.label}</span>
              {o.active && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {muted && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5">
              <span className="min-w-0 text-sm text-moon-200/85">
                {t('tribe.notif.replies')}
                <span className="mt-0.5 block text-[11px] text-moon-200/50">{t('tribe.notif.repliesHint')}</span>
              </span>
              <Switch
                checked={replies}
                label={t('tribe.notif.replies')}
                onChange={(v) => {
                  setReplies(v)
                  void save('keep', v, archived)
                }}
              />
            </div>
          )}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5">
            <span className="min-w-0 text-sm text-moon-200/85">
              📦 {t('tribe.notif.archive')}
              <span className="mt-0.5 block text-[11px] text-moon-200/50">{t('tribe.notif.archiveHint')}</span>
            </span>
            <Switch
              checked={archived}
              label={t('tribe.notif.archive')}
              onChange={(v) => {
                setArchived(v)
                void save('keep', replies, v)
              }}
            />
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-sm text-moon-200/85">
              🌙 {t('tribe.notif.quiet')}
              <span className="mt-0.5 block text-[11px] text-moon-200/50">{t('tribe.notif.quietHint', { start: `${quietStart} h`, end: `${quietEnd} h` })}</span>
            </span>
            <Switch checked={quietOn} label={t('tribe.notif.quiet')} onChange={(v) => void saveQuiet(v, quietStart, quietEnd)} />
          </div>
          {quietOn && (
            <div className="mt-2 flex items-center gap-2 text-xs text-moon-200/70">
              <label className="flex items-center gap-1.5">
                {t('tribe.notif.quietFrom')}
                <select value={quietStart} onChange={(e) => void saveQuiet(true, Number(e.target.value), quietEnd)} className="rounded-lg border border-night-600 bg-night-900 px-2 py-1 text-sm text-moon-200">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{`${h} h`}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                {t('tribe.notif.quietTo')}
                <select value={quietEnd} onChange={(e) => void saveQuiet(true, quietStart, Number(e.target.value))} className="rounded-lg border border-night-600 bg-night-900 px-2 py-1 text-sm text-moon-200">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{`${h} h`}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
        {devicePrompt && <p className="mt-3 text-[11px] text-moon-200/55">ℹ️ {t('tribe.notif.devicePrompt')}</p>}
        {error && <p className="mt-2 text-xs text-blood-400">{error}</p>}
      </div>
    </div>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-moon-400 bg-moon-400/80' : 'border-night-500 bg-night-800'}`}
    >
      <span className={`absolute top-0.5 rounded-full transition-all ${checked ? 'left-[1.375rem] bg-night-950' : 'left-0.5 bg-moon-200/60'}`} style={{ height: '1.125rem', width: '1.125rem' }} />
    </button>
  )
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm active:bg-night-700 ${danger ? 'text-blood-400' : 'text-moon-200'}`}>
      {children}
    </button>
  )
}

/** Une ligne de message : bulle, citation, réactions ; appui long = menu, glisser vers la droite = répondre. */
const Message = memo(function Message({
  m,
  mine,
  selfId,
  groupStart,
  groupEnd,
  time,
  namesFor,
  onMenu,
  onReply,
  onJump,
  onReact,
  onNames,
  formerLabel,
  youLabel,
  goneLabel,
  mentionNames,
  myName,
}: {
  m: TribeMessage
  mine: boolean
  selfId: string | undefined
  groupStart: boolean
  groupEnd: boolean
  time: string
  namesFor: string | null
  onMenu: (id: string) => void
  onReply: (m: TribeMessage) => void
  onJump: (id: string | null | undefined) => void
  onReact: (id: string, emoji: string) => void
  onNames: (v: { id: string; emoji: string } | null) => void
  formerLabel: string
  youLabel: string
  goneLabel: string
  mentionNames: string[]
  myName: string | undefined
}) {
  const [offset, setOffset] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiping = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pillTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressPill = useRef(false)

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const reset = () => {
    cancelTimer()
    start.current = null
    swiping.current = false
    setOffset(0)
  }
  const cancelPill = () => {
    if (pillTimer.current) clearTimeout(pillTimer.current)
    pillTimer.current = null
  }

  const grouped = useMemo(() => {
    const map = new Map<string, TribeMessageReaction[]>()
    for (const r of m.reactions ?? []) map.set(r.emoji, [...(map.get(r.emoji) ?? []), r])
    return TRIBE_REACTIONS.filter((e) => map.has(e)).map((emoji) => ({ emoji, entries: map.get(emoji)! }))
  }, [m.reactions])

  const hasQuote = !!m.reply_snippet || !!m.reply_name
  const gone = hasQuote && !m.reply_to
  const stickerDef = stickerById(m.sticker)
  const quoteEl = hasQuote ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onJump(m.reply_to)
                }}
                className={`mb-1 block w-full min-w-[9rem] max-w-full overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left ${mine ? 'border-amber-300 bg-black/20' : 'border-sky-400 bg-black/25'}`}
              >
                <span className={`block truncate text-[11px] font-semibold ${mine ? 'text-amber-200' : 'text-sky-300'}`}>{m.reply_name ?? formerLabel}</span>
                <span className={`line-clamp-2 break-words text-xs ${gone ? 'italic opacity-60' : 'opacity-80'}`}>{gone ? goneLabel : m.reply_snippet}</span>
              </button>
  ) : null

  return (
    <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && <span className="w-8 shrink-0">{groupEnd && <Avatar config={m.avatar_config} icon={m.avatar_icon} name={m.username ?? '?'} className="h-8 w-8" />}</span>}
      <div className={`relative flex min-w-0 max-w-[82%] flex-col md:max-w-[34rem] ${mine ? 'items-end' : 'items-start'}`}>
        {/* flèche de réponse qui apparaît pendant le glissement */}
        {offset > 6 && (
          <span
            aria-hidden="true"
            className="absolute -left-9 top-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-night-700 text-sm text-moon-200"
            style={{ opacity: Math.min(1, offset / SWIPE_REPLY_PX), transform: `translateY(-50%) scale(${offset >= SWIPE_REPLY_PX ? 1.15 : 0.9})` }}
          >
            ↩
          </span>
        )}
        <div
          className="min-w-0 max-w-full select-none"
          style={{ touchAction: 'pan-y', transform: offset ? `translateX(${offset}px)` : undefined, transition: offset ? undefined : 'transform 0.18s ease-out' }}
          onContextMenu={(e) => {
            e.preventDefault()
            onMenu(m.id)
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return
            start.current = { x: e.clientX, y: e.clientY }
            swiping.current = false
            cancelTimer()
            timer.current = setTimeout(() => {
              timer.current = null
              if (!swiping.current) {
                navigator.vibrate?.(15)
                onMenu(m.id)
              }
            }, LONG_PRESS_MS)
          }}
          onPointerMove={(e) => {
            const s = start.current
            if (!s) return
            const dx = e.clientX - s.x
            const dy = e.clientY - s.y
            if (!swiping.current && (Math.abs(dy) > 10 || dx < -10)) {
              cancelTimer()
              return
            }
            if (dx > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              swiping.current = true
              cancelTimer()
              setOffset(Math.min(dx * 0.8, 80))
            }
          }}
          onPointerUp={() => {
            if (swiping.current && offset >= SWIPE_REPLY_PX) {
              navigator.vibrate?.(10)
              onReply(m)
            }
            reset()
          }}
          onPointerCancel={reset}
          onPointerLeave={() => {
            if (!swiping.current) cancelTimer()
          }}
        >
          {stickerDef ? (
            <div className="flex max-w-full flex-col gap-1">
              {!mine && groupStart && (
                <div className="flex items-center gap-1.5 px-1">
                  <span className={`truncate text-[12px] font-semibold ${colorOf(m.user_id)}`}>{m.username ?? formerLabel}</span>
                  {m.role && m.role !== 'membre' && <RoleBadge role={m.role} />}
                </div>
              )}
              {quoteEl && <div className={`rounded-xl p-1 ${mine ? 'bg-blood-700/85' : 'bg-night-800'}`}>{quoteEl}</div>}
              <Sticker def={stickerDef} avatarConfig={m.avatar_config} avatarIcon={m.avatar_icon} name={m.username ?? undefined} size={124} />
              <span className="self-end rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] leading-none text-moon-200/85">{time}</span>
            </div>
          ) : (
          <div className={`flow-root max-w-full rounded-2xl px-2.5 py-1.5 shadow-sm ${!mine && (m.mention_all || (selfId && m.mentions?.includes(selfId))) ? 'ring-1 ring-amber-300/70' : ''} ${mine ? 'bg-blood-700/85 text-[#fdf6e3]' : 'bg-night-800 text-moon-200'} ${groupStart ? (mine ? 'rounded-tr-sm' : 'rounded-tl-sm') : ''}`}>
              {!mine && groupStart && (
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className={`truncate text-[12px] font-semibold ${colorOf(m.user_id)}`}>{m.username ?? formerLabel}</span>
                  {m.role && m.role !== 'membre' && <RoleBadge role={m.role} />}
                </div>
              )}
              {quoteEl}
              <p className="whitespace-pre-wrap break-words text-[14.5px] leading-5">
                {renderBody(m.body ?? '', mentionNames, myName)}
                <span className="float-right ml-3 mt-1.5 text-[10px] leading-none opacity-55">{time}</span>
              </p>
            </div>
          )}
        </div>

        {grouped.length > 0 && (
          <div className={`relative z-10 -mt-1.5 mb-1.5 flex flex-wrap gap-1 px-1 ${mine ? 'justify-end' : ''}`}>
            {grouped.map((g) => {
              const mineReacted = g.entries.some((r) => r.user_id === selfId)
              return (
                <span key={g.emoji} className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (suppressPill.current) {
                        suppressPill.current = false
                        return
                      }
                      onReact(m.id, g.emoji)
                    }}
                    onPointerDown={() => {
                      cancelPill()
                      pillTimer.current = setTimeout(() => {
                        suppressPill.current = true
                        navigator.vibrate?.(15)
                        onNames({ id: m.id, emoji: g.emoji })
                      }, LONG_PRESS_MS)
                    }}
                    onPointerUp={cancelPill}
                    onPointerLeave={cancelPill}
                    onPointerCancel={cancelPill}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`select-none rounded-full border px-1.5 py-0.5 text-xs shadow-sm ${mineReacted ? 'border-moon-400/60 bg-night-700 text-moon-200' : 'border-night-600 bg-night-900 text-moon-200/80'}`}
                  >
                    {g.emoji}
                    {g.entries.length > 1 && <span className="ml-0.5 text-[11px]">{g.entries.length}</span>}
                  </button>
                  {namesFor === g.emoji && (
                    <div onClick={(e) => e.stopPropagation()} className={`absolute top-full z-30 mt-1.5 w-max max-w-[10rem] rounded-xl border border-night-600 bg-night-800 px-2.5 py-2 text-left shadow-card ${mine ? 'right-0' : 'left-0'}`}>
                      <p className="mb-1 text-center text-sm leading-none">{g.emoji}</p>
                      <ul className="flex flex-col gap-0.5">
                        {g.entries.map((r) => (
                          <li key={r.user_id} className="truncate text-xs text-moon-200/80">
                            {r.user_id === selfId ? youLabel : (r.username ?? formerLabel)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})

/** Zone de saisie isolée : sa propre frappe ne redessine pas la liste des messages. */
function Composer({
  members,
  selfId,
  replyTo,
  stickersOpen,
  onToggleStickers,
  onCancelReply,
  onJump,
  onSent,
  onError,
}: {
  members: TribeMember[]
  selfId: string | undefined
  replyTo: TribeMessage | null
  stickersOpen: boolean
  onToggleStickers: () => void
  onCancelReply: () => void
  onJump: (id: string | null | undefined) => void
  onSent: () => void
  onError: (text: string) => void
}) {
  const { t } = useLanguage()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [pick, setPick] = useState(0)

  // @pseudo en cours de frappe : suggère les membres dont le pseudo commence (puis contient) ce qui est tapé.
  const mention = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret))
  const query = mention ? mention[2].toLowerCase() : null
  // Le chef et les sous-chefs peuvent aussi proposer @everyone (ou @tous) : toute la tribu est prévenue.
  const selfRole = members.find((x) => x.user_id === selfId)?.role
  const everyoneWord = query !== null && (selfRole === 'chef' || selfRole === 'sous_chef') ? EVERYONE_TAGS.find((w) => w.startsWith(query)) : undefined
  const suggestions: { key: string; name: string; member?: TribeMember }[] =
    query === null
      ? []
      : [
          ...(everyoneWord ? [{ key: '@everyone', name: everyoneWord }] : []),
          ...members
            .filter((x) => x.user_id !== selfId && x.username.toLowerCase().includes(query))
            .sort((x, y) => Number(y.username.toLowerCase().startsWith(query)) - Number(x.username.toLowerCase().startsWith(query)))
            .slice(0, 5)
            .map((x) => ({ key: x.user_id, name: x.username, member: x })),
        ].slice(0, 5)

  function insertMention(name: string) {
    if (!mention) return
    const tokenStart = caret - mention[2].length - 1
    const next = `${text.slice(0, tokenStart)}@${name} ${text.slice(caret)}`.slice(0, TRIBE_MESSAGE_MAX)
    const pos = Math.min(tokenStart + name.length + 2, next.length)
    setText(next)
    setCaret(pos)
    setPick(0)
    requestAnimationFrame(() => {
      areaRef.current?.focus()
      areaRef.current?.setSelectionRange(pos, pos)
    })
  }

  // Le champ grandit avec le texte (jusqu'à 5 lignes), puis défile.
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  useEffect(() => {
    if (replyTo) areaRef.current?.focus()
  }, [replyTo])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const { error: rpcError } = await supabase.rpc('send_tribe_message', { p_body: body, p_reply_to: replyTo?.id ?? null })
    setSending(false)
    if (rpcError) {
      onError(rpcError.message)
      return
    }
    setText('')
    onSent()
    areaRef.current?.focus()
  }

  return (
    <form onSubmit={send} className="relative flex flex-col">
      {suggestions.length > 0 && (
        <ul className="absolute inset-x-2.5 bottom-full z-10 mb-1 overflow-hidden rounded-xl border border-night-600 bg-night-800 shadow-card" role="listbox">
          {suggestions.map((x, i) => (
            <li key={x.key}>
              <button
                type="button"
                role="option"
                aria-selected={i === pick}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(x.name)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === pick ? 'bg-night-700' : ''}`}
              >
                {x.member ? (
                  <Avatar config={x.member.avatar_config} icon={x.member.avatar_icon} name={x.name} className="h-6 w-6" />
                ) : (
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300/20 text-sm">📣</span>
                )}
                <span className="min-w-0 flex-1 truncate text-moon-200">{x.member ? x.name : `@${x.name}`}</span>
                {x.member ? x.member.role !== 'membre' && <RoleBadge role={x.member.role} /> : <span className="shrink-0 text-[11px] text-amber-200/80">{t('tribe.chat.everyoneHint')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {replyTo && (
        <div className="mx-2.5 mt-2 flex items-stretch gap-2 rounded-xl bg-night-800 p-1.5">
          <button type="button" onClick={() => onJump(replyTo.id)} className="min-w-0 flex-1 rounded-lg border-l-4 border-sky-400 bg-black/20 px-2 py-1 text-left">
            <span className="block truncate text-[11px] font-semibold text-sky-300">{t('tribe.chat.replyingTo', { name: replyTo.username ?? t('tribe.formerMember') })}</span>
            <span className="block truncate text-xs text-moon-200/70">{replyTo.sticker ? `🎭 ${t('tribe.chat.stickerLabel')}` : replyTo.body}</span>
          </button>
          <button type="button" onClick={onCancelReply} aria-label={t('common.cancel')} className="flex w-8 shrink-0 items-center justify-center rounded-full text-moon-200/60 active:bg-night-700">
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 px-2.5 pt-2">
        <button
          type="button"
          onClick={onToggleStickers}
          aria-label={t('tribe.chat.stickers')}
          aria-pressed={stickersOpen}
          className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition-colors ${stickersOpen ? 'bg-moon-400/25' : 'bg-night-800'}`}
        >
          🎭
        </button>
        <textarea
          ref={areaRef}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value.slice(0, TRIBE_MESSAGE_MAX))
            setCaret(e.target.selectionStart ?? e.target.value.length)
            setPick(0)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setPick((p) => (p + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                insertMention(suggestions[Math.min(pick, suggestions.length - 1)].name)
                return
              }
            }
            // Ordinateur : Entrée envoie, Maj+Entrée saute une ligne. Mobile : Entrée saute une ligne.
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={t('tribe.chat.placeholder')}
          maxLength={TRIBE_MESSAGE_MAX}
          className="max-h-[120px] min-h-[42px] min-w-0 flex-1 resize-none rounded-3xl border border-night-600/60 bg-night-800 px-4 py-2.5 text-base leading-5 text-moon-200 outline-none placeholder:text-moon-200/35 focus:border-moon-400/50"
        />
        <button type="submit" disabled={sending || !text.trim()} aria-label={t('tribe.chat.send')} className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blood-600 text-lg text-[#fdf6e3] transition-opacity disabled:opacity-40">
          ➤
        </button>
      </div>
    </form>
  )
}
