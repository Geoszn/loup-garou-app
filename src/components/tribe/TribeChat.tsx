import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import type { TranslationKey } from '../../i18n/translations'
import { TRIBE_MESSAGE_MAX, type TribeInfo, type TribeMessage } from '../../lib/tribe'
import { Avatar } from '../Avatar'
import { ErrorText } from '../ui'
import { RoleBadge } from './TribeBits'
import { notifyTribeSummaryChanged } from '../../hooks/useTribeSummary'

const POLL_MS = 12000

/**
 * Le chat de la tribu. Branché en direct SEULEMENT pendant que cet onglet est
 * ouvert (un canal Realtime par tribu, fermé en quittant), avec une relecture
 * de sécurité toutes les 12 s tant que l'écran est visible. Le serveur ne garde
 * que les 200 derniers messages ; chaque nouveau message déclenche une relecture
 * groupée (debounce) plutôt qu'un traitement message par message.
 */
export function TribeChat({ tribe }: { tribe: TribeInfo }) {
  const { t, lang } = useLanguage()
  const { user } = useAuth()
  const [messages, setMessages] = useState<TribeMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [reported, setReported] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const lastReadRef = useRef(0)
  const muted = !!tribe.muted_until && new Date(tribe.muted_until).getTime() > Date.now()
  const isManager = tribe.my_role === 'chef' || tribe.my_role === 'sous_chef'

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_tribe_messages', { p_before: null, p_limit: 100 })
    if (rpcError || !Array.isArray(data)) return
    setMessages(data as TribeMessage[])
    if (Date.now() - lastReadRef.current > 4000) {
      lastReadRef.current = Date.now()
      // Lu : la pastille « non lus » (barre du bas, accueil) se remet à jour.
      void Promise.resolve(supabase.rpc('mark_tribe_read')).then(() => notifyTribeSummaryChanged())
    }
  }, [])

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

  // Reste en bas quand un message arrive, sauf si le joueur a remonté l'historique.
  useEffect(() => {
    const el = listRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  async function send(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending || muted) return
    setSending(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('send_tribe_message', { p_body: body })
    setSending(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setText('')
    stickRef.current = true
    await load()
  }

  async function remove(id: string) {
    setSelected(null)
    setMessages((list) => list.filter((m) => m.id !== id))
    const { error: rpcError } = await supabase.rpc('delete_tribe_message', { p_message_id: id })
    if (rpcError) setError(rpcError.message)
  }

  async function report(id: string) {
    setSelected(null)
    const { error: rpcError } = await supabase.rpc('report_tribe_message', { p_message_id: id })
    if (rpcError) setError(rpcError.message)
    else setReported((s) => new Set(s).add(id))
  }

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="flex h-[52vh] min-h-[320px] flex-col gap-3 overflow-y-auto rounded-2xl border border-night-600/50 bg-night-950/60 p-3"
      >
        {messages.length === 0 && <p className="m-auto text-center text-sm text-moon-200/40">{t('tribe.chat.empty')}</p>}
        {messages.map((m, i) => {
          const showDay = i === 0 || dayOf(messages[i - 1].created_at) !== dayOf(m.created_at)
          return (
            <div key={m.id} className="flex flex-col gap-3">
              {showDay && <p className="mx-auto rounded-full bg-night-800/70 px-3 py-1 text-[10px] capitalize text-moon-200/40">{dayOf(m.created_at)}</p>}
              {m.kind === 'system' ? (
                <p className="text-center text-[11px] text-moon-200/45">
                  {t(`tribe.event.${m.event}` as TranslationKey, { actor: m.actor_name ?? '?', target: m.target_name ?? '?' })}
                </p>
              ) : (
                <div className={`flex gap-2 ${m.user_id === user?.id ? 'flex-row-reverse' : ''}`}>
                  <Avatar config={m.avatar_config} icon={m.avatar_icon} name={m.username ?? '?'} className="h-8 w-8 shrink-0" />
                  <div className={`flex max-w-[78%] flex-col gap-0.5 ${m.user_id === user?.id ? 'items-end' : ''}`}>
                    {m.user_id !== user?.id && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-moon-200/80">{m.username ?? t('tribe.formerMember')}</span>
                        {m.role && m.role !== 'membre' && <RoleBadge role={m.role} />}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelected(selected === m.id ? null : m.id)}
                      className={`break-words rounded-2xl px-3 py-2 text-left text-sm ${m.user_id === user?.id ? 'rounded-tr-sm bg-blood-700/70 text-[#fdf6e3]' : 'rounded-tl-sm bg-night-800/90 text-moon-200'}`}
                    >
                      {m.body}
                    </button>
                    <span className="text-[9.5px] text-moon-200/30">{timeOf(m.created_at)}</span>
                    {selected === m.id && (
                      <div className="flex gap-2">
                        {m.user_id !== user?.id && !reported.has(m.id) && (
                          <button type="button" onClick={() => report(m.id)} className="rounded-lg border border-night-500 px-2 py-1 text-[11px] text-moon-200/70">
                            🚩 {t('tribe.chat.report')}
                          </button>
                        )}
                        {reported.has(m.id) && <span className="text-[11px] text-emerald-400">{t('tribe.chat.reported')}</span>}
                        {(isManager || m.user_id === user?.id) && (
                          <button type="button" onClick={() => remove(m.id)} className="rounded-lg border border-blood-500/40 px-2 py-1 text-[11px] text-blood-400">
                            🗑️ {t('tribe.chat.delete')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-center text-[10px] text-moon-200/30">{t('tribe.chat.retention')}</p>
      {muted ? (
        <p className="rounded-xl bg-night-900/60 px-3 py-3 text-center text-xs text-moon-200/60">{t('tribe.chat.muted')}</p>
      ) : (
        <form onSubmit={send} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, TRIBE_MESSAGE_MAX))}
            placeholder={t('tribe.chat.placeholder')}
            maxLength={TRIBE_MESSAGE_MAX}
            className="min-w-0 flex-1 rounded-xl border border-night-600/60 bg-night-800/70 px-3 py-2.5 text-sm text-moon-200 outline-none placeholder:text-moon-200/30 focus:border-moon-400/50"
          />
          <button type="submit" disabled={sending || !text.trim()} aria-label={t('tribe.chat.send')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blood-600 text-[#fdf6e3] disabled:opacity-40">
            ➤
          </button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
