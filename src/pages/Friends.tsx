import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { notifyFriendRequest } from '../lib/pushSubscription'
import { Button, Card, ErrorText, Input, Label, SuccessText } from '../components/ui'
import { AvatarIcon } from '../components/AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from '../components/Avatar'
import { PlayerProfileModal } from '../components/PlayerProfileModal'
import { PAGE_SIZE, Pager } from '../components/CollapsibleCard'

interface Person {
  user_id: string
  username: string
  avatar_icon: string
  avatar_config?: unknown
}

/** Débounce simple (300ms) : la recherche se lance après une pause de frappe
 * plutôt qu'à chaque touche, pour ne pas spammer search_people. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

interface FriendRequest extends Person {
  request_id: string
  created_at: string
}

interface Social {
  friend_code: string
  friends: Person[]
  incoming_requests: FriendRequest[]
  outgoing_requests: FriendRequest[]
}

/** La page Amis a rejoint la page Tribu (onglet « Amis ») : l'ancienne adresse y renvoie. */
export default function Friends() {
  return <Navigate to="/tribu?tab=amis" replace />
}

/** Les amis : codes, recherche, demandes et liste. Affiché dans l'onglet « Amis » de la page Tribu. */
export function FriendsPanel() {
  const { t } = useLanguage()
  const [social, setSocial] = useState<Social | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [friendPage, setFriendPage] = useState(0)
  const [openFriendId, setOpenFriendId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Person[] | null>(null)
  const [searching, setSearching] = useState(false)
  const debouncedSearch = useDebounced(search.trim(), 350)
  const searchSeq = useRef(0)

  async function load() {
    const { data, error: rpcError } = await supabase.rpc('get_my_social')
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setSocial(data as Social)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    supabase.rpc('search_people', { p_query: debouncedSearch }).then(({ data, error: rpcError }) => {
      if (seq !== searchSeq.current) return
      setSearching(false)
      setSearchResults(rpcError || !Array.isArray(data) ? [] : (data as Person[]))
    })
  }, [debouncedSearch])

  async function copyCode() {
    if (social) await navigator.clipboard.writeText(social.friend_code)
    setSuccess(t('friends.code.copied'))
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (code.trim().length < 4) {
      setError(t('friends.add.invalidCode'))
      return
    }
    setSending(true)
    const { data, error: rpcError } = await supabase.rpc('send_friend_request', { p_friend_code: code.trim() })
    setSending(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setCode('')
    setSuccess(data?.status === 'accepted' ? t('friends.add.becameFriends') : t('friends.add.sent'))
    if (data?.status === 'pending' && data?.target_user_id) void notifyFriendRequest(data.target_user_id)
    await load()
  }

  async function respond(requestId: string, accept: boolean) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('respond_friend_request', {
      p_request_id: requestId,
      p_accept: accept,
    })
    if (rpcError) setError(rpcError.message)
    await load()
  }

  if (loading || !social) return <div className="h-40 animate-pulse rounded-2xl bg-night-900/40" />

  return (
    <>
      <div className="flex flex-col gap-6">

        <Card>
          <h2 className="mb-1 font-display text-lg text-moon-200">{t('friends.search.title')}</h2>
          <p className="mb-3 text-sm text-moon-200/50">{t('friends.search.subtitle')}</p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('friends.search.placeholder')}
          />
          {debouncedSearch.length >= 2 && (
            <div className="mt-3">
              {searching ? (
                <p className="text-sm text-moon-200/40">{t('common.loading')}</p>
              ) : !searchResults || searchResults.length === 0 ? (
                <p className="text-sm text-moon-200/50">{t('friends.search.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {searchResults.map((p) => (
                    <li key={p.user_id}>
                      <button
                        type="button"
                        onClick={() => setOpenFriendId(p.user_id)}
                        className="flex w-full items-center gap-2 rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-left text-sm transition-colors hover:border-moon-400/40"
                      >
                        <Avatar config={p.avatar_config} icon={p.avatar_icon} name={p.username} className="h-7 w-7 shrink-0" />
                        <span className="truncate text-moon-200/90">{p.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-display text-lg text-moon-200">{t('friends.code.title')}</h2>
          <p className="mb-4 text-sm text-moon-200/50">{t('friends.code.subtitle')}</p>
          <div className="flex items-center gap-3">
            <p
              data-testid="friend-code"
              className="flex-1 rounded-xl border border-night-500 bg-night-800/80 px-4 py-3 text-center font-display text-xl tracking-[0.3em] text-moon-300"
            >
              {social.friend_code}
            </p>
            <Button variant="ghost" onClick={copyCode}>
              {t('friends.code.copy')}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-lg text-moon-200">{t('friends.add.title')}</h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="friend-code-input">{t('friends.add.codeLabel')}</Label>
              <Input
                id="friend-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="AB12CD"
                maxLength={8}
                className="tracking-[0.3em] text-center font-display text-lg"
              />
            </div>
            <ErrorText>{error}</ErrorText>
            <SuccessText>{success}</SuccessText>
            <Button type="submit" disabled={sending} className="w-full">
              {sending ? t('common.sending') : t('friends.add.submit')}
            </Button>
          </form>
        </Card>

        {social.incoming_requests.length > 0 && (
          <Card>
            <h2 className="mb-4 font-display text-lg text-moon-200">{t('friends.incoming.title')}</h2>
            <ul className="flex flex-col gap-2">
              {social.incoming_requests.map((r) => (
                <li
                  key={r.request_id}
                  className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-1.5 text-moon-200/90">
                    <Avatar config={r.avatar_config} icon={r.avatar_icon} name={r.username} className="h-7 w-7" /> {r.username}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => respond(r.request_id, false)}>
                      {t('friends.incoming.decline')}
                    </Button>
                    <Button className="px-3 py-1.5 text-xs" onClick={() => respond(r.request_id, true)}>
                      {t('friends.incoming.accept')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {social.outgoing_requests.length > 0 && (
          <Card>
            <h2 className="mb-4 font-display text-lg text-moon-200">{t('friends.outgoing.title')}</h2>
            <ul className="flex flex-col gap-2">
              {social.outgoing_requests.map((r) => (
                <li
                  key={r.request_id}
                  className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-1.5 text-moon-200/90">
                    <Avatar config={r.avatar_config} icon={r.avatar_icon} name={r.username} className="h-7 w-7" /> {r.username}
                  </span>
                  <span className="text-xs text-moon-200/40">{t('friends.outgoing.pending')}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h2 className="mb-4 font-display text-lg text-moon-200">{t('friends.list.title', { count: social.friends.length })}</h2>
          {social.friends.length === 0 ? (
            <p className="text-sm text-moon-200/50">{t('friends.list.empty')}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {social.friends.slice(friendPage * PAGE_SIZE, (friendPage + 1) * PAGE_SIZE).map((f) => (
                  <li key={f.user_id}>
                    <button
                      type="button"
                      onClick={() => setOpenFriendId(f.user_id)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-left text-sm transition-colors hover:border-moon-400/40"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-moon-200/90">
                        <Avatar config={f.avatar_config} icon={f.avatar_icon} name={f.username} className="h-7 w-7 shrink-0" />
                        <span className="truncate">{f.username}</span>
                      </span>
                      <span className="shrink-0 text-moon-200/40" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <Pager page={friendPage} pageCount={Math.ceil(social.friends.length / PAGE_SIZE)} onChange={setFriendPage} />
              </div>
            </>
          )}
        </Card>
      </div>
      {openFriendId && (
        <PlayerProfileModal
          userId={openFriendId}
          onClose={() => setOpenFriendId(null)}
          onFriendRemoved={() => {
            setOpenFriendId(null)
            setFriendPage(0)
            void load()
          }}
        />
      )}
    </>
  )
}
