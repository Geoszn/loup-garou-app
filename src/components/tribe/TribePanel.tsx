import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { usePresence } from '../../context/PresenceContext'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { useTribeSummary, notifyTribeSummaryChanged } from '../../hooks/useTribeSummary'
import { notifyTribeInvite, notifyTribeMessage } from '../../lib/pushSubscription'
import { cachedRpc } from '../../lib/rpcCache'
import {
  TRIBE_COLORS,
  TRIBE_CREATE_MIN_POINTS,
  isChatQuiet,
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
  type TribeRequestOut,
  type TribeSearchResult,
  type TribeInviteIn,
} from '../../lib/tribe'
import { FriendsPanel } from '../../pages/Friends'
import { PlayerProfileModal } from '../PlayerProfileModal'
import { RankTierBadge } from '../RankTierBadge'
import { tierForPoints, tierLabel, type RankTier } from '../../lib/ranks'
import { continentName } from '../../lib/continents'
import { Avatar } from '../Avatar'
import { Button, Card, ConfirmDialog, ErrorText, Modal, Segmented } from '../ui'
import { TribeShield } from './TribeShield'
import { TribeChat } from './TribeChat'
import { VillageSky, VillageView } from './VillageView'
import { DECOR_UNLOCKS } from './VillageDecor'
import { OnlineDot, RoleBadge } from './TribeBits'

const primaryBtn =
  'inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-blood-500 to-blood-700 px-4 py-3 text-sm font-semibold text-[#fdf6e3] shadow-blood-btn transition-all active:scale-[0.97] disabled:opacity-50'
const fieldCls =
  'w-full rounded-xl border border-night-500 bg-night-800/80 px-4 py-3 text-sm text-moon-200 outline-none placeholder:text-moon-200/30 focus:border-moon-400/60'
const sectionLabel = 'text-[11px] font-semibold uppercase tracking-wider text-moon-200/45'

type RoomTab = 'village' | 'chat' | 'members' | 'manage' | 'friends'
const ROOM_TABS: RoomTab[] = ['village', 'chat', 'members', 'manage', 'friends']

/** Petite pastille rouge (nombre) ou point rouge. */
function Dot({ n }: { n?: number }) {
  if (n !== undefined && n <= 0) return null
  return (
    <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-blood-500 px-1 text-[10px] font-bold leading-4 text-[#fdf6e3]">
      {n === undefined ? '' : n > 99 ? '99+' : n}
    </span>
  )
}

/** Nombre de demandes d'amis en attente (pastille de l'onglet « Amis »). */
function usePendingFriends(): number {
  const { user } = useAuth()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!user) return
    let active = true
    cachedRpc<{ incoming_requests?: unknown[] }>('get_my_social').then(({ data }) => {
      if (active && data) setN((data.incoming_requests ?? []).length)
    })
    return () => {
      active = false
    }
  }, [user])
  return n
}

/**
 * Page « Tribu » (migration 0222/0223) : avec une tribu, un village où chaque membre
 * a sa maison, le chat, la liste des membres, les invitations et demandes, et —
 * en option secondaire — les amis. Sans tribu : chercher une tribu (par nom ou
 * par code) pour lui demander à entrer, répondre aux invitations ou fonder la
 * sienne.
 */
export function TribeHub() {
  const { summary, loaded, refresh } = useTribeSummary(true, 45000)
  const [params] = useSearchParams()
  const requested = params.get('tab')
  const [tab, setTab] = useState<RoomTab>(() => (requested === 'amis' ? 'friends' : (ROOM_TABS as string[]).includes(requested ?? '') ? (requested as RoomTab) : 'village'))
  const [creating, setCreating] = useState(false)
  const pendingFriends = usePendingFriends()

  if (!loaded) return <div className="h-40 animate-pulse rounded-2xl bg-night-900/40" />
  if (summary?.tribe) return <TribeRoom tribe={summary.tribe} refresh={refresh} tab={tab} setTab={setTab} pendingFriends={pendingFriends} />

  if (creating) {
    return (
      <TribeForm
        mode="create"
        onCancel={() => setCreating(false)}
        onDone={async () => {
          setCreating(false)
          await refresh()
          notifyTribeSummaryChanged()
        }}
      />
    )
  }
  return (
    <TribeLanding
      invites={summary?.invites ?? []}
      myRequests={summary?.my_requests ?? []}
      refresh={refresh}
      onCreate={() => setCreating(true)}
      friendsTab={tab === 'friends'}
      setFriendsTab={(on) => setTab(on ? 'friends' : 'village')}
      pendingFriends={pendingFriends}
    />
  )
}

// ---------------------------------------------------------------------------
// Sans tribu : chercher, demander à entrer, répondre aux invitations, fonder
// ---------------------------------------------------------------------------
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function TribeLanding({
  invites,
  myRequests,
  refresh,
  onCreate,
  friendsTab,
  setFriendsTab,
  pendingFriends,
}: {
  invites: TribeInviteIn[]
  myRequests: TribeRequestOut[]
  refresh: () => Promise<void>
  onCreate: () => void
  friendsTab: boolean
  setFriendsTab: (on: boolean) => void
  pendingFriends: number
}) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const myPoints = profile?.rank_points ?? 0
  const canCreate = myPoints >= TRIBE_CREATE_MIN_POINTS
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TribeSearchResult[] | null>(null)
  const debounced = useDebounced(query.trim(), 350)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null)
      return
    }
    const { data, error: rpcError } = await supabase.rpc('search_tribes', { p_query: q })
    if (rpcError) setError(rpcError.message)
    else setResults((data as TribeSearchResult[]) ?? [])
  }, [])
  useEffect(() => {
    void search(debounced)
  }, [debounced, search])

  async function respond(id: string, accept: boolean) {
    setBusy(id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('respond_tribe_invite', { p_invite_id: id, p_accept: accept })
    setBusy(null)
    if (rpcError) setError(rpcError.message)
    await refresh()
    notifyTribeSummaryChanged()
  }

  async function requestJoin(tribeId: string) {
    setBusy(tribeId)
    setError(null)
    const { error: rpcError } = await supabase.rpc('request_join_tribe', { p_tribe_id: tribeId })
    setBusy(null)
    if (rpcError) setError(rpcError.message)
    await Promise.all([search(debounced), refresh()])
  }

  async function cancelRequest(id: string) {
    setError(null)
    const { error: rpcError } = await supabase.rpc('cancel_tribe_join_request', { p_request_id: id })
    if (rpcError) setError(rpcError.message)
    await Promise.all([search(debounced), refresh()])
  }

  return (
    <div className="flex flex-col gap-4">
      <Segmented<'tribe' | 'friends'>
        tabs={[
          { id: 'tribe', label: `🛡️ ${t('tribe.tab')}` },
          { id: 'friends', label: <span>👥 {t('tribe.tabs.friends')}<Dot n={pendingFriends} /></span> },
        ]}
        active={friendsTab ? 'friends' : 'tribe'}
        onChange={(id) => setFriendsTab(id === 'friends')}
      />
      {friendsTab ? (
        <FriendsPanel />
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="font-display text-lg text-moon-200">{t('tribe.search.title')}</h2>
              <p className="text-xs text-moon-200/55">{t('tribe.search.subtitle')}</p>
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`🔍 ${t('tribe.search.placeholder')}`} className={fieldCls} />
            {debounced.length >= 2 && results !== null && (
              results.length === 0 ? (
                <p className="text-xs text-moon-200/45">{t('tribe.search.none')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {results.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/50 p-3">
                      <TribeShield emblem={r.emblem} color={r.color} className="h-11 w-11 text-xl" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-moon-200">{r.name}</p>
                        <p className="truncate text-[11px] text-moon-200/50">{t('tribe.members.count', { n: r.member_count, max: 30 })}{r.motto ? ` · ${r.motto}` : ''}</p>
                      </div>
                      {r.requested ? (
                        <button type="button" onClick={() => r.request_id && cancelRequest(r.request_id)} className="rounded-lg bg-night-700 px-3 py-1.5 text-xs text-moon-200/70">
                          {t('tribe.request.sent')} ✓
                        </button>
                      ) : r.full ? (
                        <span className="text-[11px] text-moon-200/45">{t('tribe.search.full')}</span>
                      ) : !r.accepting ? (
                        <span className="text-[11px] text-moon-200/45">{t('tribe.search.closed')}</span>
                      ) : (
                        <button type="button" disabled={busy === r.id} onClick={() => requestJoin(r.id)} className="rounded-lg bg-blood-600 px-3 py-1.5 text-xs font-semibold text-[#fdf6e3] disabled:opacity-50">
                          {t('tribe.request.send')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
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

          {myRequests.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className={sectionLabel}>{t('tribe.request.mine', { n: myRequests.length })}</p>
              {myRequests.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/50 p-3">
                  <TribeShield emblem={r.emblem} color={r.color} className="h-10 w-10 text-lg" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-moon-200">{r.tribe_name}</p>
                  <button type="button" onClick={() => cancelRequest(r.id)} className="text-xs text-moon-200/50 hover:text-moon-200">
                    {t('tribe.invite.cancel')}
                  </button>
                </div>
              ))}
            </div>
          )}

          <Card className="flex flex-col items-center gap-2 text-center">
            <span className="text-3xl" aria-hidden="true">🛡️</span>
            <h2 className="font-display text-lg text-moon-200">{t('tribe.empty.title')}</h2>
            <p className="text-xs leading-relaxed text-moon-200/60">{t('tribe.empty.body')}</p>
            {canCreate ? (
              <button type="button" onClick={onCreate} className={`${primaryBtn} mt-1`}>
                {t('tribe.create.cta')}
              </button>
            ) : (
              <div className="mt-1 flex w-full flex-col items-center gap-2">
                <button type="button" disabled className={`${primaryBtn} cursor-not-allowed opacity-45`}>
                  🔒 {t('tribe.create.cta')}
                </button>
                <p className="text-xs font-semibold text-amber-300">{t('tribe.create.locked', { rank: tierLabel(tierForPoints(TRIBE_CREATE_MIN_POINTS).id, t), pts: TRIBE_CREATE_MIN_POINTS })}</p>
                <span className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-night-800">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (myPoints / TRIBE_CREATE_MIN_POINTS) * 100)}%` }} />
                </span>
                <p className="text-[11px] text-moon-200/55">{t('tribe.create.lockedHint', { have: myPoints })}</p>
              </div>
            )}
          </Card>
          <ErrorText>{error}</ErrorText>
        </>
      )}
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
  const [accepting, setAccepting] = useState(tribe?.accepting_requests ?? true)
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
        : await supabase.rpc('update_tribe', { p_motto: motto, p_emblem: emblem, p_color: color, p_accepting: accepting })
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
      {mode === 'edit' && (
        <label className="flex items-center gap-3 rounded-xl border border-night-600/60 bg-night-900/50 px-4 py-3 text-sm text-moon-200">
          <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} className="h-4 w-4 accent-blood-500" />
          <span className="min-w-0 flex-1">
            {t('tribe.edit.accepting')}
            <span className="block text-[11px] text-moon-200/45">{t('tribe.edit.acceptingHint')}</span>
          </span>
        </label>
      )}
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={!valid || busy} className={primaryBtn}>
        {mode === 'create' ? t('tribe.create.submit') : t('tribe.edit.submit')}
      </button>
      {mode === 'create' && <p className="text-center text-[11px] text-moon-200/40">{t('tribe.create.note')}</p>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Ma tribu : village, chat, membres, invitations et demandes, amis
// ---------------------------------------------------------------------------
function TribeRoom({ tribe, refresh, tab, setTab, pendingFriends }: { tribe: TribeInfo; refresh: () => Promise<void>; tab: RoomTab; setTab: (t: RoomTab) => void; pendingFriends: number }) {
  const { t } = useLanguage()
  const { user, profile } = useAuth()
  const [partyBusy, setPartyBusy] = useState(false)
  const { onlineStatus } = usePresence()
  const [detail, setDetail] = useState<TribeDetail | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState<'leave' | 'disband' | null>(null)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<TribeMember | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [levelOpen, setLevelOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isManager = tribe.my_role === 'chef' || tribe.my_role === 'sous_chef'
  const activeTab: RoomTab = tab === 'manage' && !isManager ? 'village' : tab

  // Partie de tribu : crée un salon, le poste dans le chat de la tribu (marqué « partie de tribu », bonus d'XP) puis y entre.
  async function startParty() {
    setError(null)
    setPartyBusy(true)
    const { data, error: createError } = await supabase.rpc('create_game', { p_display_name: profile?.username ?? t('common.playerFallback'), p_settings: null, p_is_public: false })
    if (createError || !data) {
      setPartyBusy(false)
      setError(createError?.message ?? t('tribe.party.error'))
      return
    }
    const game = data as { game_id: string; code: string }
    const { error: inviteError } = await supabase.rpc('invite_tribe_to_game', { p_game_id: game.game_id, p_party: true })
    if (inviteError) {
      // Le salon existe déjà : on y entre quand même, l'invitation pourra être renvoyée depuis le salon.
      setError(inviteError.message)
    } else {
      void notifyTribeMessage()
      notifyTribeSummaryChanged()
    }
    setPartyBusy(false)
    navigate(`/partie/${game.code}/lobby`)
  }

  const loadDetail = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_tribe_detail')
    if (!rpcError && data) setDetail(data as TribeDetail)
  }, [])
  useEffect(() => {
    void loadDetail()
  }, [loadDetail, tribe.member_count, tribe.pending_requests])
  // Les arrivées apparaissent dans le village sans recharger : relecture douce
  // tant qu'un onglet qui montre les membres est ouvert et visible.
  useEffect(() => {
    if (activeTab !== 'village' && activeTab !== 'members' && activeTab !== 'manage') return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void loadDetail()
    }, 20000)
    return () => clearInterval(id)
  }, [activeTab, loadDetail])

  const onlineIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(onlineStatus))
    if (user) ids.add(user.id)
    return ids
  }, [onlineStatus, user])
  const gameCodes = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [id, p] of Object.entries(onlineStatus)) if (p.status === 'in_game' && p.game_code) out[id] = p.game_code
    return out
  }, [onlineStatus])
  const onlineCount = detail ? detail.members.filter((m) => onlineIds.has(m.user_id)).length : 0
  const reloadAll = useCallback(async () => {
    await loadDetail()
    await refresh()
    notifyTribeSummaryChanged()
  }, [loadDetail, refresh])

  async function runConfirmed() {
    const action = confirm
    setConfirm(null)
    setMenuOpen(false)
    if (!action) return
    const { error: rpcError } = await supabase.rpc(action === 'leave' ? 'leave_tribe' : 'disband_tribe')
    if (rpcError) setError(rpcError.message)
    await refresh()
    notifyTribeSummaryChanged()
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(tribe.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Presse-papiers indisponible : le code reste affiché, on peut le recopier à la main.
    }
  }

  if (editing) {
    return (
      <TribeForm
        mode="edit"
        tribe={tribe}
        onCancel={() => setEditing(false)}
        onDone={async () => {
          setEditing(false)
          await reloadAll()
        }}
      />
    )
  }

  const unreadForTab = activeTab === 'chat' || isChatQuiet(tribe) ? 0 : tribe.unread
  const tabs: { id: RoomTab; icon: string; label: string; badge?: number }[] = [
    { id: 'village', icon: '🏘️', label: t('tribe.tabs.village') },
    { id: 'chat', icon: '💬', label: t('tribe.tabs.chat'), badge: unreadForTab },
    { id: 'members', icon: '👥', label: t('tribe.tabs.members') },
    ...(isManager ? [{ id: 'manage' as const, icon: '✉️', label: t('tribe.tabs.invites'), badge: tribe.pending_requests }] : []),
    { id: 'friends', icon: '🤝', label: t('tribe.tabs.friends'), badge: pendingFriends },
  ]

  // Sur grand écran, le village prend la page : menu à gauche, grande île à droite.
  const wide = activeTab === 'village'
  return (
    <div className={`flex flex-col gap-3 ${wide ? 'lg:relative lg:left-1/2 lg:grid lg:w-[min(calc(100vw-4rem),72rem)] lg:-translate-x-1/2 lg:grid-cols-[19rem_minmax(0,1fr)] lg:content-start lg:items-start lg:gap-x-6' : ''}`}>
      {activeTab === 'village' && <VillageSky />}
      <div className={`flex items-center gap-3 ${wide ? 'lg:col-start-1' : ''}`}>
        <TribeShield emblem={tribe.emblem} color={tribe.color} className="h-14 w-14 text-2xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl leading-tight text-moon-200">{tribe.name}</h2>
          <p className="text-[11px] text-moon-200/50">
            {detail && <span className="text-emerald-400">● {t('tribe.online', { n: onlineCount })}</span>} {detail && '· '}
            {t('tribe.members.count', { n: detail?.members.length ?? tribe.member_count, max: tribe.max })}
          </p>
          {tribe.level !== undefined && (
            <button type="button" onClick={() => setLevelOpen(true)} aria-label={t('tribe.level.title')} className="mt-1 flex w-full max-w-[230px] items-center gap-2 text-left">
              <span className="shrink-0 rounded-md bg-amber-400 px-1.5 text-[10px] font-extrabold leading-4 text-night-950">{t('tribe.level.short', { n: tribe.level })}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-night-800 ring-1 ring-white/10">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                  style={{ width: `${tribe.xp_next == null ? 100 : Math.max(4, Math.min(100, (((tribe.xp ?? 0) - (tribe.xp_floor ?? 0)) / (tribe.xp_next - (tribe.xp_floor ?? 0))) * 100))}%` }}
                />
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-moon-200/60">
                {tribe.xp_next == null ? t('tribe.level.max') : `${(tribe.xp ?? 0) - (tribe.xp_floor ?? 0)}/${tribe.xp_next - (tribe.xp_floor ?? 0)}`}
              </span>
            </button>
          )}
          <button type="button" onClick={copyCode} className="text-[11px] text-moon-200/45 hover:text-moon-200/80">
            {t('tribe.code')} <b className="font-mono tracking-widest text-amber-300">{tribe.code}</b> {copied ? `✓ ${t('common.copied')}` : '📋'}
          </button>
        </div>
        <button type="button" onClick={() => setMenuOpen(true)} aria-label={t('tribe.menu.title')} className="rounded-lg border border-night-500 bg-night-800 px-2.5 py-1 text-moon-200/80 shadow-md">
          ⋯
        </button>
      </div>

      {/* tous les onglets visibles d'un coup : une colonne chacun, icône au-dessus du nom */}
      <div className={`grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-1 ${wide ? 'lg:col-start-1 lg:grid-cols-1' : ''}`} style={{ ['--cols' as string]: tabs.length }}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            aria-pressed={activeTab === x.id}
            className={`relative flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 transition-colors ${wide ? 'lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-2.5' : ''} ${activeTab === x.id ? 'bg-blood-600 text-[#fdf6e3]' : 'border border-night-600/60 bg-night-900/70 text-moon-200/70'}`}
          >
            <span className="text-lg leading-none" aria-hidden="true">{x.icon}</span>
            <span className={`w-full truncate text-center text-[10px] font-semibold leading-3 ${wide ? 'lg:text-left lg:text-sm' : ''}`}>{x.label}</span>
            {x.badge !== undefined && x.badge > 0 && (
              <span className={`absolute right-1 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-blood-500 px-1 text-[10px] font-bold leading-4 text-[#fdf6e3] ring-2 ring-night-950 ${wide ? 'lg:right-3 lg:top-1/2 lg:-translate-y-1/2' : ''}`}>
                {x.badge > 99 ? '99+' : x.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'village' && (
        <button
          type="button"
          disabled={partyBusy}
          onClick={() => void startParty()}
          className="flex items-center gap-3 rounded-2xl border border-amber-300/40 bg-gradient-to-b from-amber-400/20 to-amber-500/5 px-3.5 py-2.5 text-left transition-opacity active:opacity-80 disabled:opacity-60 lg:col-start-1"
        >
          <span aria-hidden="true" className="text-2xl">🏆</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-amber-200">{t('tribe.party.button')}</span>
            <span className="block text-[11px] leading-snug text-moon-200/60">{t('tribe.party.hint')}</span>
          </span>
        </button>
      )}

      {activeTab === 'village' && (
        <div className="min-w-0 lg:col-start-2 lg:row-span-3 lg:row-start-1">
        {detail ? (
          <VillageView
            tribe={tribe}
            members={detail.members}
            onlineIds={onlineIds}
            gameCodes={gameCodes}
            selfId={user?.id}
            onProfile={(m) => setProfileId(m.user_id)}
            onChat={() => setTab('chat')}
            onManage={setSelected}
            onJoinGame={(code) => navigate(`/rejoindre/${code}`)}
          />
        ) : (
          <div className="h-72 animate-pulse rounded-3xl bg-night-900/40" />
        )}
        </div>
      )}
      {activeTab === 'chat' && <TribeChat tribe={tribe} members={detail?.members ?? []} onBack={() => setTab('village')} onlineCount={detail ? onlineCount : null} memberCount={detail?.members.length ?? tribe.member_count} />}
      {activeTab === 'members' && <MembersView tribe={tribe} detail={detail} onlineIds={onlineIds} onSelect={setSelected} goInvite={() => setTab('manage')} />}
      {activeTab === 'manage' && isManager && <ManageView detail={detail} reload={reloadAll} />}
      {activeTab === 'friends' && <FriendsPanel />}
      <ErrorText>{error}</ErrorText>

      {profileId && <PlayerProfileModal userId={profileId} onClose={() => setProfileId(null)} />}
      <MemberSheet tribe={tribe} member={selected} onlineIds={onlineIds} onClose={() => setSelected(null)} reload={reloadAll} />

      <Modal open={levelOpen} onClose={() => setLevelOpen(false)} title={t('tribe.level.title')}>
        <div className="flex flex-col gap-3 text-sm text-moon-200/85">
          <div className="flex items-center gap-3 rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2.5">
            <span className="rounded-md bg-amber-400 px-2 py-0.5 text-sm font-extrabold text-night-950">{t('tribe.level.short', { n: tribe.level ?? 1 })}</span>
            <span className="text-xs text-moon-200/70">
              {tribe.xp_next == null ? t('tribe.level.max') : t('tribe.level.progress', { xp: tribe.xp ?? 0, next: tribe.xp_next, n: (tribe.level ?? 1) + 1 })}
            </span>
          </div>
          <p>{t('tribe.level.intro')}</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-moon-200/75">
            <li>{t('tribe.level.rule1')}</li>
            <li>{t('tribe.level.rule2')}</li>
            <li>{t('tribe.level.rule3')}</li>
            <li>{t('tribe.level.rule4')}</li>
          </ul>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-moon-200/50">{t('tribe.level.unlocks')}</p>
            <ul className="flex flex-col gap-1.5">
              {DECOR_UNLOCKS.map((d) => {
                const reached = (tribe.level ?? 1) >= d.level
                return (
                  <li key={d.level} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs ${reached ? 'border-amber-400/40 bg-amber-400/10 text-moon-200' : 'border-night-600/60 bg-night-900/50 text-moon-200/50'}`}>
                    <span className={`text-lg ${reached ? '' : 'grayscale'}`} aria-hidden="true">{d.icon}</span>
                    <span className="min-w-0 flex-1">{t(d.label)}</span>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${reached ? 'bg-amber-400 text-night-950' : 'bg-night-800 text-moon-200/60'}`}>{reached ? '✓' : t('tribe.level.unlockedAt', { n: d.level })}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <Button variant="ghost" onClick={() => setLevelOpen(false)}>
            {t('common.close')}
          </Button>
        </div>
      </Modal>
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
// Fiche d'un membre (touche une maison du village ou une ligne de la liste)
// ---------------------------------------------------------------------------
interface PublicProfile {
  username: string
  continent: string | null
  rank_points: number
  tier: string
  best_streak: number
  rank_wins: number
  rank_games_played: number
}

function MemberSheet({ tribe, member, onlineIds, onClose, reload }: { tribe: TribeInfo; member: TribeMember | null; onlineIds: Set<string>; onClose: () => void; reload: () => Promise<void> }) {
  const { t, lang } = useLanguage()
  const { user } = useAuth()
  const [confirm, setConfirm] = useState<'kick' | 'transfer' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [fullProfile, setFullProfile] = useState<string | null>(null)
  const isChef = tribe.my_role === 'chef'
  const memberId = member?.user_id

  // Les informations du propriétaire de la case : rang, victoires, continent…
  useEffect(() => {
    setProfile(null)
    if (!memberId) return
    let active = true
    supabase.rpc('get_player_public_profile', { p_user_id: memberId }).then(({ data }) => {
      if (active && data) setProfile(data as PublicProfile)
    })
    return () => {
      active = false
    }
  }, [memberId])

  if (!member) return null
  const manage = member.user_id !== user?.id && (isChef || (tribe.my_role === 'sous_chef' && member.role === 'membre'))

  async function run(fn: string, args: Record<string, unknown>) {
    setConfirm(null)
    setError(null)
    const { error: rpcError } = await supabase.rpc(fn, args)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onClose()
    await reload()
  }

  const since = new Date(member.joined_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const continent = profile ? continentName(profile.continent, lang) : null

  return (
    <>
      <Modal open={confirm === null && !fullProfile} onClose={onClose} title={member.username}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar config={member.avatar_config} icon={member.avatar_icon} name={member.username} className="h-16 w-16" />
            <div className="min-w-0">
              <RoleBadge role={member.role} />
              <p className="mt-1 flex items-center gap-1.5 text-xs text-moon-200/60">
                <OnlineDot online={onlineIds.has(member.user_id)} /> {onlineIds.has(member.user_id) ? t('tribe.status.online') : t('tribe.status.offline')}
                {member.muted && <span> · 🔇 {t('tribe.member.muted')}</span>}
              </p>
              <p className="mt-0.5 text-[11px] text-moon-200/45">{t('tribe.sheet.since', { date: since })}</p>
            </div>
          </div>
          {profile && (
            <div className="flex items-center gap-3 rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2.5">
              <RankTierBadge tier={profile.tier as RankTier} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-moon-200">
                  {tierLabel(profile.tier, t)} <span className="text-xs font-normal text-moon-200/50">· {profile.rank_points} pts</span>
                </p>
                <p className="text-[11px] text-moon-200/55">
                  {t('tribe.sheet.stats', { wins: profile.rank_wins, games: profile.rank_games_played })}
                  {profile.best_streak > 0 && ` · ${t('tribe.sheet.streak', { n: profile.best_streak })}`}
                  {continent && ` · ${continent}`}
                </p>
              </div>
            </div>
          )}
          {member.user_id !== user?.id && (
            <Button variant="ghost" onClick={() => setFullProfile(member.user_id)}>
              👤 {t('tribe.sheet.profile')}
            </Button>
          )}
          {manage && (
            <div className="flex flex-col gap-2">
              {isChef && member.role !== 'sous_chef' && (
                <Button variant="ghost" onClick={() => run('set_tribe_role', { p_user_id: member.user_id, p_role: 'sous_chef' })}>
                  ⭐ {t('tribe.member.promote')}
                </Button>
              )}
              {isChef && member.role === 'sous_chef' && (
                <Button variant="ghost" onClick={() => run('set_tribe_role', { p_user_id: member.user_id, p_role: 'membre' })}>
                  {t('tribe.member.demote')}
                </Button>
              )}
              {isChef && (
                <Button variant="ghost" onClick={() => setConfirm('transfer')}>
                  👑 {t('tribe.member.transfer')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => run('mute_tribe_member', { p_user_id: member.user_id, p_hours: member.muted ? 0 : 24 })}>
                {member.muted ? `🔊 ${t('tribe.member.unmute')}` : `🔇 ${t('tribe.member.mute')}`}
              </Button>
              <Button variant="ghost" onClick={() => setConfirm('kick')} className="!text-blood-400">
                🚪 {t('tribe.member.kick')}
              </Button>
            </div>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'transfer' ? t('tribe.transfer.title') : t('tribe.kick.title')}
        message={confirm === 'transfer' ? t('tribe.transfer.body', { name: member.username }) : t('tribe.kick.body', { name: member.username })}
        confirmLabel={confirm === 'transfer' ? t('tribe.member.transfer') : t('tribe.member.kick')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(confirm === 'transfer' ? 'transfer_tribe_chief' : 'kick_tribe_member', { p_user_id: member.user_id })}
      />
      {fullProfile && <PlayerProfileModal userId={fullProfile} onClose={() => setFullProfile(null)} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Membres (liste)
// ---------------------------------------------------------------------------
function MembersView({ tribe, detail, onlineIds, onSelect, goInvite }: { tribe: TribeInfo; detail: TribeDetail | null; onlineIds: Set<string>; onSelect: (m: TribeMember) => void; goInvite: () => void }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const isManager = tribe.my_role === 'chef' || tribe.my_role === 'sous_chef'
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
        <button key={m.user_id} type="button" onClick={() => onSelect(m)} className="flex items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/50 px-3 py-2.5 text-left transition-colors hover:border-moon-400/30">
          <div className="relative">
            <Avatar config={m.avatar_config} icon={m.avatar_icon} name={m.username} className="h-10 w-10" />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-night-950 p-0.5">
              <OnlineDot online={onlineIds.has(m.user_id)} />
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
          <span className="text-moon-200/30" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Invitations et demandes d'adhésion (chef et sous-chefs)
// ---------------------------------------------------------------------------
function ManageView({ detail, reload }: { detail: TribeDetail | null; reload: () => Promise<void> }) {
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

  async function answer(id: string, accept: boolean) {
    setBusy(id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('respond_tribe_join_request', { p_request_id: id, p_accept: accept })
    setBusy(null)
    if (rpcError) setError(rpcError.message)
    await reload()
  }

  const daysLeft = (iso: string) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
  const left = detail ? Math.max(detail.invites_limit - detail.invites_today, 0) : null

  return (
    <div className="flex flex-col gap-3">
      {detail && detail.requests_in.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3">
          <p className={sectionLabel}>{t('tribe.request.incoming', { n: detail.requests_in.length })}</p>
          {detail.requests_in.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl bg-night-900/60 px-3 py-2.5">
              <Avatar config={r.avatar_config} icon={r.avatar_icon} name={r.username} className="h-10 w-10" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-moon-200">{r.username}</p>
              <button type="button" disabled={busy === r.id} onClick={() => answer(r.id, true)} className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {t('tribe.request.accept')}
              </button>
              <button type="button" disabled={busy === r.id} onClick={() => answer(r.id, false)} aria-label={t('tribe.request.decline')} className="px-1 text-moon-200/40 hover:text-moon-200">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

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
