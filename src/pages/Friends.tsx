import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Label, SuccessText } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { AvatarIcon } from '../components/AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'

interface Person {
  user_id: string
  username: string
  avatar_icon: string
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

export default function Friends() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [social, setSocial] = useState<Social | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

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

  async function remove(friendId: string) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('remove_friend', { p_friend_id: friendId })
    if (rpcError) setError(rpcError.message)
    await load()
  }

  if (loading || !social) return <FullScreenLoader />

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="px-3.5 py-2 text-xs">
            {t('common.back')}
          </Button>
          <h1 className="font-display text-2xl text-moon-200">{t('friends.title')}</h1>
        </header>

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
                    <AvatarIcon icon={r.avatar_icon} className="h-4 w-4" /> {r.username}
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
                    <AvatarIcon icon={r.avatar_icon} className="h-4 w-4" /> {r.username}
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
            <ul className="flex flex-col gap-2">
              {social.friends.map((f) => (
                <li
                  key={f.user_id}
                  className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-1.5 text-moon-200/90">
                    <AvatarIcon icon={f.avatar_icon} className="h-4 w-4" /> {f.username}
                  </span>
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => remove(f.user_id)}>
                    {t('friends.list.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

