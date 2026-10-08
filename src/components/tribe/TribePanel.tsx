import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { usePresence } from '../../context/PresenceContext'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { useTribeSummary } from '../../hooks/useTribeSummary'
import { notifyTribeInvite } from '../../lib/pushSubscription'
import {
  TRIBE_COLORS,
  TRIBE_EMBLEMS,
  TRIBE_MOTTO_MAX,
  TRIBE_NAME_MAX,
  TRIBE_NAME_MIN,
  type TribeCandidate,
  type TribeColor,
  type TribeDetail,
  type TribeEmblem,
  type TribeInfo,
  type TribeMember,
} from '../../lib/tribe'
import { Avatar } from '../Avatar'
import { Button, Card, ConfirmDialog, ErrorText, Modal, Segmented } from '../ui'
import { TribeShield } from './TribeShield'
import { TribeChat } from './TribeChat'
import { OnlineDot, RoleBadge } from './TribeBits'

const primaryBtn =
  'inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-blood-500 to-blood-700 px-4 py-3 text-sm font-semibold text-[#fdf6e3] shadow-blood-btn transition-all active:scale-[0.97] disabled:opacity-50'
const fieldCls =
  'w-full rounded-xl border border-night-500 bg-night-800/80 px-4 py-3 text-sm text-moon-200 outline-none placeholder:text-moon-200/30 focus:border-moon-400/60'
const sectionLabel = 'text-[11px] font-semibold uppercase tracking-wider text-moon-200/45'

/** Onglet « Tribu » de la page Amis (migration 0222). */
export function TribePanel() {
  const { summary, loaded, refresh } = useTribeSummary()
  const [creating, setCreating] = useState(false)

  if (!loaded) return <div className="h-40 animate-pulse rounded-2xl bg-night-900/40" />
  if (summary?.tribe) return <TribeRoom tribe={summary.tribe} refresh={refresh} />
  if (creating) {
    return (
      <TribeForm
        mode="create"
        onCancel={() => setCreating(false)}
        onDone={async () => {
          setCreating(false)
          await refresh()
        }}
      />
    )
  }
  return <NoTribe invites={summary?.invites ?? []} refresh={refresh} onCreate={() => setCreating(true)} />
}

// ---------------------------------------------------------------------------
// Sans tribu : créer la sienne ou répondre aux invitations reçues
// ---------------------------------------------------------------------------
function NoTribe({ invites, refresh, onCreate }: { invites: NonNullable<ReturnType<typeof useTribeSummary>['summary']>['invites']; refresh: () => Promise<void>; onCreate: () => void }) {
  const { t } = useLanguage()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function respond(id: string, accept: boolean) {
    setBusy(id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('respond_tribe_invite', { p_invite_id: id, p_accept: accept })
    setBusy(null)
    if (rpcError) setError(rpcError.message)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">🛡️</span>
        <h2 className="font-display text-lg text-moon-200">{t('tribe.empty.title')}</h2>
        <p className="text-xs leading-relaxed text-moon-200/60">{t('tribe.empty.body')}</p>
        <button type="button" onClick={onCreate} className={`${primaryBtn} mt-2`}>
          {t('tribe.create.cta')}
        </button>
      </Card>

      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={sectionLabel}>{t('tribe.invites.received', { n: invites.length })}</p>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/50 p-3">
              <TribeShield emblem={i.emblem} color={i.color} className="h-11 w-11 text-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-moon-200">{i.tribe_name}</p>
                <p className="truncate text-[11px] text-moon-200/50">{t('tribe.invite.by', { count: i.member_count, by: i.invited_by_name })}</p>
              </div>
              <button type="button" disabled={busy === i.id} onClick={() => respond(i.id, true)} className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {t('tribe.invite.join')}
              </button>
              <button type="button" disabled={busy === i.id} onClick={() => respond(i.id, false)} aria-label={t('tribe.invite.decline')} className="px-1 text-moon-200/40 hover:text-moon-200">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fonder / modifier : blason, couleur, nom, devise
// ---------------------------------------------------------------------------
function TribeForm({ mode, tribe, onCancel, onDone }: { mode: 'create' | 'edit'; tribe?: TribeInfo; onCancel: () => void; onDone: () => Promise<void> }) {
  const { t } = useLanguage()
  const [emblem, setEmblem] = useState<TribeEmblem>(tribe?.emblem ?? 'eagle')
  const [color, setColor] = useState<TribeColor>(tribe?.color ?? 'sky')
  const [name, setName] = useState(tribe?.name ?? '')
  const [motto, setMotto] = useState(tribe?.motto ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = mode === 'edit' || name.trim().length >= TRIBE_NAME_MIN

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const { error: rpcError } =
      mode === 'create'
        ? await supabase.rpc('create_tribe', { p_name: name, p_motto: motto, p_emblem: emblem, p_color: color })
        : await supabase.rpc('update_tribe', { p_motto: motto, p_emblem: emblem, p_color: color })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    await onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="px-1 text-xl text-moon-200/60" aria-label={t('common.back')}>
          ‹
        </button>
        <h2 className="font-display text-xl text-moon-200">{mode === 'create' ? t('tribe.create.title') : t('tribe.edit.title')}</h2>
      </div>
      <div className="flex justify-center">
        <TribeShield emblem={emblem} color={color} className="h-24 w-24 text-5xl" />
      </div>
      <div>
        <p className={`${sectionLabel} mb-1.5`}>{t('tribe.create.emblem')}</p>
        <div className="grid grid-cols-6 gap-2">
          {TRIBE_EMBLEMS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEmblem(e.id)}
              aria-pressed={emblem === e.id}
              className={`flex aspect-square items-center justify-center rounded-xl border text-xl ${emblem === e.id ? 'border-moon-400 bg-moon-400/10' : 'border-night-600/60 bg-night-900/50'}`}
            >
              {e.icon}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {TRIBE_COLORS.map((c) => (
            <button key={c.id} type="button" onClick={() => setColor(c.id)} aria-pressed={color === c.id} aria-label={c.id} className={`h-8 flex-1 rounded-lg bg-gradient-to-b ${c.gradient} ${color === c.id ? 'ring-2 ring-moon-400' : ''}`} />
          ))}
        </div>
      </div>
      <div>
        <p className={`${sectionLabel} mb-1.5`}>{t('tribe.create.name')}</p>
        {mode === 'create' ? (
          <>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, TRIBE_NAME_MAX))} maxLength={TRIBE_NAME_MAX} placeholder={t('tribe.create.namePh')} className={fieldCls} />
            <p className="mt-1 text-right text-[10px] text-moon-200/35">
              {name.length} / {TRIBE_NAME_MAX}
            </p>
          </>
        ) : (
          <p className={`${fieldCls} opacity-60`}>{tribe?.name}</p>
        )}
      </div>
      <div>
        <p className={`${sectionLabel} mb-1.5`}>{t('tribe.create.motto')}</p>
        <input value={motto} onChange={(e) => setMotto(e.target.value.slice(0, TRIBE_MOTTO_MAX))} maxLength={TRIBE_MOTTO_MAX} placeholder={t('tribe.create.mottoPh')} className={fieldCls} />
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={!valid || busy} className={primaryBtn}>
        {mode === 'create' ? t('tribe.create.submit') : t('tribe.edit.submit')}
      </button>
      {mode === 'create' && <p className="text-center text-[11px] text-moon-200/40">{t('tribe.create.note')}</p>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Ma tribu : discussion, membres, invitations
// ---------------------------------------------------------------------------
type RoomTab = 'chat' | 'members' | 'invites'

function TribeRoom({ tribe, refresh }: { tribe: TribeInfo; refresh: () => Promise<void> }) {
  const { t } = useLanguage()
  const { onlineStatus } = usePresence()
  const [tab, setTab] = useState<RoomTab>('chat')
  const [detail, setDetail] = useState<TribeDetail | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState<'leave' | 'disband' | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isManager = tribe.my_role === 'chef' || tribe.my_role === 'sous_chef'

  const loadDetail = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_tribe_detail')
    if (!rpcError && data) setDetail(data as TribeDetail)
  }, [])
  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const onlineCount = detail ? detail.members.filter((m) => onlineStatus[m.user_id]).length : 0

  async function runConfirmed() {
    const action = confirm
    setConfirm(null)
    setMenuOpen(false)
    if (!action) return
    const { error: rpcError } = await supabase.rpc(action === 'leave' ? 'leave_tribe' : 'disband_tribe')
    if (rpcError) setError(rpcError.message)
    await refresh()
  }

  if (editing) {
    return (
      <TribeForm
        mode="edit"
        tribe={tribe}
        onCancel={() => setEditing(false)}
        onDone={async () => {
          setEditing(false)
          await refresh()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <TribeShield emblem={tribe.emblem} color={tribe.color} className="h-14 w-14 text-2xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl leading-tight text-moon-200">{tribe.name}</h2>
          <p className="text-[11px] text-moon-200/50">
            {detail && <span className="text-emerald-400">● {t('tribe.online', { n: onlineCount })}</span>} {detail && '· '}
            {t('tribe.members.count', { n: detail?.members.length ?? tribe.member_count, max: tribe.max })}
          </p>
          {tribe.motto && <p className="truncate text-[11px] italic text-moon-200/40">« {tribe.motto} »</p>}
        </div>
        <button type="button" onClick={() => setMenuOpen(true)} aria-label={t('tribe.menu.title')} className="rounded-lg border border-night-500 px-2.5 py-1 text-moon-200/70">
          ⋯
        </button>
      </div>

      <Segmented<RoomTab>
        tabs={[
          { id: 'chat', label: `💬 ${t('tribe.tabs.chat')}` },
          { id: 'members', label: `👥 ${t('tribe.tabs.members')}` },
          ...(isManager ? [{ id: 'invites' as const, label: `✉️ ${t('tribe.tabs.invites')}` }] : []),
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'chat' && <TribeChat tribe={tribe} />}
      {tab === 'members' && <MembersView tribe={tribe} detail={detail} reload={async () => { await loadDetail(); await refresh() }} goInvite={() => setTab('invites')} />}
      {tab === 'invites' && isManager && <InvitesView detail={detail} reload={loadDetail} />}
      <ErrorText>{error}</ErrorText>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={tribe.name}>
        <div className="flex flex-col gap-2">
          {tribe.my_role === 'chef' && (
            <Button variant="ghost" onClick={() => { setMenuOpen(false); setEditing(true) }}>
              ✏️ {t('tribe.menu.edit')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setConfirm('leave')}>
            🚪 {t('tribe.menu.leave')}
          </Button>
          {tribe.my_role === 'chef' && (
            <Button variant="ghost" onClick={() => setConfirm('disband')} className="!text-blood-400">
              🗑️ {t('tribe.menu.disband')}
            </Button>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'disband' ? t('tribe.disband.title') : t('tribe.leave.title')}
        message={confirm === 'disband' ? t('tribe.disband.body') : tribe.my_role === 'chef' ? t('tribe.leave.bodyChief') : t('tribe.leave.body')}
        confirmLabel={confirm === 'disband' ? t('tribe.menu.disband') : t('tribe.menu.leave')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Membres
// ---------------------------------------------------------------------------
function MembersView({ tribe, detail, reload, goInvite }: { tribe: TribeInfo; detail: TribeDetail | null; reload: () => Promise<void>; goInvite: () => void }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { onlineStatus } = usePresence()
  const [target, setTarget] = useState<TribeMember | null>(null)
  const [confirm, setConfirm] = useState<'kick' | 'transfer' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isChef = tribe.my_role === 'chef'
  const isManager = isChef || tribe.my_role === 'sous_chef'

  // Ce que mon rôle m'autorise à faire sur ce membre (le serveur revérifie tout).
  const canManage = (m: TribeMember) => m.user_id !== user?.id && (isChef || (tribe.my_role === 'sous_chef' && m.role === 'membre'))

  async function run(fn: string, args: Record<string, unknown>) {
    setConfirm(null)
    setTarget(null)
    setError(null)
    const { error: rpcError } = await supabase.rpc(fn, args)
    if (rpcError) setError(rpcError.message)
    await reload()
  }

  if (!detail) return <div className="h-32 animate-pulse rounded-2xl bg-night-900/40" />

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className={sectionLabel}>{t('tribe.members.title', { n: detail.members.length })}</p>
        {isManager && (
          <button type="button" onClick={goInvite} className="rounded-xl border border-night-500 bg-night-800/60 px-3 py-2 text-xs font-semibold text-moon-200">
            ＋ {t('tribe.members.invite')}
          </button>
        )}
      </div>
      {detail.members.map((m) => (
        <div key={m.user_id} className="flex items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/50 px-3 py-2.5">
          <div className="relative">
            <Avatar config={m.avatar_config} icon={m.avatar_icon} name={m.username} className="h-10 w-10" />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-night-950 p-0.5">
              <OnlineDot online={!!onlineStatus[m.user_id]} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-moon-200">
              {m.username} {m.user_id === user?.id && <span className="text-[11px] font-normal text-moon-200/40">({t('tribe.you')})</span>}
            </p>
            <div className="flex items-center gap-1.5">
              <RoleBadge role={m.role} />
              {m.muted && <span className="text-[10px] text-moon-200/45">🔇 {t('tribe.member.muted')}</span>}
            </div>
          </div>
          {canManage(m) && (
            <button type="button" onClick={() => setTarget(m)} aria-label={t('tribe.menu.title')} className="rounded-lg px-2 py-1 text-moon-200/50 hover:text-moon-200">
              ⋯
            </button>
          )}
        </div>
      ))}
      <ErrorText>{error}</ErrorText>

      <Modal open={!!target && confirm === null} onClose={() => setTarget(null)} title={target?.username ?? ''}>
        {target && (
          <div className="flex flex-col gap-2">
            {isChef && target.role !== 'sous_chef' && (
              <Button variant="ghost" onClick={() => run('set_tribe_role', { p_user_id: target.user_id, p_role: 'sous_chef' })}>
                ⭐ {t('tribe.member.promote')}
              </Button>
            )}
            {isChef && target.role === 'sous_chef' && (
              <Button variant="ghost" onClick={() => run('set_tribe_role', { p_user_id: target.user_id, p_role: 'membre' })}>
                {t('tribe.member.demote')}
              </Button>
            )}
            {isChef && (
              <Button variant="ghost" onClick={() => setConfirm('transfer')}>
                👑 {t('tribe.member.transfer')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => run('mute_tribe_member', { p_user_id: target.user_id, p_hours: target.muted ? 0 : 24 })}>
              {target.muted ? `🔊 ${t('tribe.member.unmute')}` : `🔇 ${t('tribe.member.mute')}`}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm('kick')} className="!text-blood-400">
              🚪 {t('tribe.member.kick')}
            </Button>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirm !== null && !!target}
        title={confirm === 'transfer' ? t('tribe.transfer.title') : t('tribe.kick.title')}
        message={confirm === 'transfer' ? t('tribe.transfer.body', { name: target?.username ?? '' }) : t('tribe.kick.body', { name: target?.username ?? '' })}
        confirmLabel={confirm === 'transfer' ? t('tribe.member.transfer') : t('tribe.member.kick')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => target && run(confirm === 'transfer' ? 'transfer_tribe_chief' : 'kick_tribe_member', { p_user_id: target.user_id })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Invitations (chef et sous-chefs)
// ---------------------------------------------------------------------------
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function InvitesView({ detail, reload }: { detail: TribeDetail | null; reload: () => Promise<void> }) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TribeCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const debounced = useDebounced(query.trim(), 350)

  const search = useCallback(async (q: string) => {
    const { data, error: rpcError } = await supabase.rpc('search_tribe_candidates', { p_query: q })
    if (rpcError) setError(rpcError.message)
    else setResults((data as TribeCandidate[]) ?? [])
  }, [])
  useEffect(() => {
    void search(debounced)
  }, [debounced, search])

  async function invite(c: TribeCandidate) {
    setBusy(c.user_id)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('invite_to_tribe', { p_user_id: c.user_id })
    setBusy(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (data?.invite_id) void notifyTribeInvite(data.invite_id)
    await Promise.all([search(debounced), reload()])
  }

  async function cancel(id: string) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('cancel_tribe_invite', { p_invite_id: id })
    if (rpcError) setError(rpcError.message)
    await Promise.all([search(debounced), reload()])
  }

  const daysLeft = (iso: string) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
  const left = detail ? Math.max(detail.invites_limit - detail.invites_today, 0) : null

  return (
    <div className="flex flex-col gap-3">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`🔍 ${t('tribe.invite.search')}`} className={fieldCls} />
      {left !== null && detail && (
        <p className="text-[11px] text-moon-200/45">
          {t('tribe.invite.left')} <b className="text-amber-300">{left} / {detail.invites_limit}</b>
        </p>
      )}
      <p className={sectionLabel}>{debounced.length >= 2 ? t('tribe.invite.results') : t('tribe.invite.friends')}</p>
      {results === null ? (
        <div className="h-16 animate-pulse rounded-2xl bg-night-900/40" />
      ) : results.length === 0 ? (
        <p className="text-xs text-moon-200/40">{t('tribe.invite.none')}</p>
      ) : (
        results.map((c) => (
          <div key={c.user_id} className="flex items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/50 px-3 py-2.5">
            <Avatar config={c.avatar_config} icon={c.avatar_icon} name={c.username} className="h-10 w-10" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-moon-200">{c.username}</p>
            {c.invited ? (
              <span className="rounded-lg bg-night-700 px-3 py-1.5 text-xs text-moon-200/50">{t('tribe.invite.sent')} ✓</span>
            ) : (
              <button type="button" disabled={busy === c.user_id || left === 0} onClick={() => invite(c)} className="rounded-lg bg-blood-600 px-3 py-1.5 text-xs font-semibold text-[#fdf6e3] disabled:opacity-40">
                {t('tribe.invite.send')}
              </button>
            )}
          </div>
        ))
      )}

      {detail && detail.invites_out.length > 0 && (
        <>
          <p className={`${sectionLabel} mt-1`}>{t('tribe.invite.pending', { n: detail.invites_out.length })}</p>
          {detail.invites_out.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/50 px-3 py-2.5">
              <Avatar config={i.avatar_config} icon={i.avatar_icon} name={i.username} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-moon-200">{i.username}</p>
                <p className="text-[10px] text-moon-200/40">
                  {t('tribe.invite.invitedBy', { name: i.invited_by_name })} · {t('tribe.invite.expires', { days: daysLeft(i.expires_at) })}
                </p>
              </div>
              <button type="button" onClick={() => cancel(i.id)} className="text-xs text-moon-200/50 hover:text-moon-200">
                {t('tribe.invite.cancel')}
              </button>
            </div>
          ))}
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <p className="text-center text-[10.5px] leading-snug text-moon-200/35">{t('tribe.invite.note')}</p>
    </div>
  )
}
