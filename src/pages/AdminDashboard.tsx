import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button, Card, ConfirmDialog, ErrorText, Input, Label, Modal, SideDrawer, SuccessText } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'

// ============================================================================
// Dashboard administrateur. Volontairement en français uniquement, pas
// passé par le système i18n (t()) du reste de l'app : cet écran n'est vu
// que par un compte admin, pas par les joueurs — inutile de doubler chaque
// chaîne en anglais pour un outil interne.
//
// Sécurité : cette page est accessible depuis une URL longue et non
// devinable (voir App.tsx), jamais affichée dans l'app — mais ce n'est
// qu'une couche d'obscurité. Le VRAI contrôle d'accès est admin_check_access()
// ci-dessous, qui vérifie côté serveur que le compte connecté a
// profiles.is_admin = true, et journalise systématiquement la tentative
// (voir onglet Sécurité). Sans ce flag, chaque action affichée ici échoue
// de toute façon côté serveur (voir migration 0048) : le pire qu'une
// personne non autorisée tombée sur ce lien puisse faire, c'est voir
// l'écran "Accès refusé".
// ============================================================================

type Tab = 'stats' | 'users' | 'games' | 'security' | 'settings'

const TAB_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'stats', label: 'Vue d’ensemble', icon: '📊' },
  { id: 'users', label: 'Utilisateurs', icon: '👤' },
  { id: 'games', label: 'Salons', icon: '🎲' },
  { id: 'security', label: 'Sécurité', icon: '🔒' },
  { id: 'settings', label: 'Réglages', icon: '⚙️' },
]

interface Stats {
  total_users: number
  new_users_today: number
  total_games: number
  active_games: number
  games_today: number
  messages_today: number
  banned_users: number
  admin_users: number
  pending_deletions: number
  pending_join_requests: number
  new_games_enabled: boolean
}

interface AdminUser {
  id: string
  username: string
  email: string
  created_at: string
  is_admin: boolean
  is_banned: boolean
  banned_reason: string | null
  lang: string
  games_count: number
}

interface AdminGame {
  id: string
  code: string
  status: string
  is_public: boolean
  created_at: string
  last_activity_at: string
  host_name: string
  player_count: number
}

const USERS_PAGE_SIZE = 10

interface RoleStat {
  role: string
  played: number
  won: number
}

interface RecentGameStat {
  game_id: string
  code: string
  winner_team: string
  role: string | null
  won: boolean
  created_at: string
}

interface AdminUserDetail {
  id: string
  username: string
  email: string
  created_at: string
  is_admin: boolean
  is_banned: boolean
  banned_reason: string | null
  banned_at: string | null
  lang: string
  avatar_icon: string
  friend_code: string
  last_sign_in_at: string | null
  stats: {
    games_played: number
    games_won: number
    by_role: RoleStat[]
    recent_games: RecentGameStat[]
  }
}

interface PendingDeletion {
  id: string
  user_id: string
  username: string
  email: string | null
  created_at: string
}

interface AccessLogEntry {
  id: string
  user_id: string | null
  username: string | null
  allowed: boolean
  created_at: string
}

interface AuditLogEntry {
  id: string
  admin_id: string
  admin_username: string | null
  action: string
  target: string | null
  details: unknown
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  lobby: 'Salon',
  role_reveal: 'Révélation des rôles',
  night: 'Nuit',
  day_reveal: 'Récap du matin',
  day_discussion: 'Débat',
  day_vote: 'Vote',
  day_vote_recap: 'Récap du vote',
  captain_election: 'Élection du capitaine',
  ended: 'Terminée',
}

const ACTION_LABELS: Record<string, string> = {
  ban_user: 'Compte suspendu',
  unban_user: 'Compte réactivé',
  grant_admin: 'Droits admin accordés',
  revoke_admin: 'Droits admin retirés',
  force_end_game: 'Partie arrêtée de force',
  process_account_deletion: 'Suppression de compte traitée',
  enable_new_games: 'Nouvelles parties réactivées',
  disable_new_games: 'Nouvelles parties désactivées',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function timeSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.floor(h / 24)} j`
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [tab, setTab] = useState<Tab>('stats')
  const [menuOpen, setMenuOpen] = useState(false)
  const current = TAB_ITEMS.find((t) => t.id === tab)!

  useEffect(() => {
    let cancelled = false
    supabase.rpc('admin_check_access').then(({ data }) => {
      if (cancelled) return
      setAllowed(!!data)
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (checking) return <FullScreenLoader />

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <Card className="w-full max-w-sm">
          <p className="mb-2 text-3xl">🚫</p>
          <p className="mb-1 font-display text-lg text-moon-200">Accès refusé</p>
          <p className="text-sm text-moon-200/60">
            Ce compte n'a pas les droits administrateur. Cette tentative a été enregistrée.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          {/* Un seul bouton menu (☰) plutôt que 5 onglets affichés en
              permanence : l'écran reste simple d'un coup d'œil, la
              navigation elle-même se fait dans le tiroir (voir SideDrawer
              ci-dessous), sur le même principe que les réglages de
              Lobby.tsx ailleurs dans l'app. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-3 rounded-xl border border-night-600/70 bg-night-800/50 px-4 py-2.5 text-left transition-colors hover:border-moon-400/40"
          >
            <span className="text-xl leading-none">☰</span>
            <span>
              <span className="block font-display text-lg text-moon-200">
                {current.icon} {current.label}
              </span>
              <span className="block text-[11px] text-moon-200/40">Menu administration</span>
            </span>
          </button>
          <p className="text-xs text-moon-200/50">{user?.email}</p>
        </div>

        {tab === 'stats' && <StatsTab />}
        {tab === 'users' && <UsersTab currentUserId={user?.id ?? null} />}
        {tab === 'games' && <GamesTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>

      <SideDrawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Administration">
        <div className="flex flex-col gap-1.5">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id)
                setMenuOpen(false)
              }}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
                tab === item.id ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/70 hover:bg-night-700/60 hover:text-moon-200'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </SideDrawer>
    </div>
  )
}

// ----------------------------------------------------------------------------
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-display text-moon-200">{value}</p>
      <p className="text-xs text-moon-200/50">{label}</p>
    </Card>
  )
}

function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_get_stats')
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setStats(data as Stats)
  }, [])

  useEffect(() => {
    load()
    // Rafraîchi toutes les 5s pour un semblant de "temps réel" sans avoir à
    // câbler un canal Realtime dédié — cohérent avec le polling déjà utilisé
    // ailleurs dans l'app (useGame.ts).
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!stats) return <p className="text-sm text-moon-200/50">Chargement...</p>

  return (
    <div className="flex flex-col gap-4">
      {!stats.new_games_enabled && (
        <ErrorText>Les nouvelles parties sont actuellement désactivées (voir onglet Réglages).</ErrorText>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Utilisateurs" value={stats.total_users} />
        <StatCard label="Nouveaux aujourd’hui" value={stats.new_users_today} />
        <StatCard label="Parties (total)" value={stats.total_games} />
        <StatCard label="Parties en cours" value={stats.active_games} />
        <StatCard label="Parties créées aujourd’hui" value={stats.games_today} />
        <StatCard label="Messages aujourd’hui" value={stats.messages_today} />
        <StatCard label="Comptes suspendus" value={stats.banned_users} />
        <StatCard label="Admins" value={stats.admin_users} />
        <StatCard label="Suppressions en attente" value={stats.pending_deletions} />
        <StatCard label="Demandes d’accès en attente" value={stats.pending_join_requests} />
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
function UsersTab({ currentUserId }: { currentUserId: string | null }) {
  // Champs du formulaire de filtre (état "brouillon", pas encore appliqué) —
  // séparés de ce qui a vraiment été envoyé au serveur pour ne relancer une
  // recherche qu'à la soumission du formulaire, pas à chaque frappe.
  const [usernameInput, setUsernameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [filters, setFilters] = useState({ username: '', email: '', from: '', to: '' })
  const [page, setPage] = useState(1)

  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null)
  const [banReason, setBanReason] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(async (f: typeof filters, p: number) => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_users', {
      p_username: f.username.trim() || null,
      p_email: f.email.trim() || null,
      p_created_from: f.from || null,
      p_created_to: f.to || null,
      p_limit: USERS_PAGE_SIZE,
      p_offset: (p - 1) * USERS_PAGE_SIZE,
    })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    const result = data as { users: AdminUser[]; total: number }
    setUsers(result.users)
    setTotal(result.total)
  }, [])

  useEffect(() => {
    load(filters, page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page])

  function applyFilters(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setFilters({ username: usernameInput, email: emailInput, from: fromInput, to: toInput })
    setFiltersOpen(false)
  }

  function resetFilters() {
    setUsernameInput('')
    setEmailInput('')
    setFromInput('')
    setToInput('')
    setPage(1)
    setFilters({ username: '', email: '', from: '', to: '' })
    setFiltersOpen(false)
  }

  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount = [filters.username, filters.email, filters.from, filters.to].filter(Boolean).length

  async function toggleBan(u: AdminUser) {
    if (u.is_banned) {
      setBusyId(u.id)
      const { error: rpcError } = await supabase.rpc('admin_set_user_ban', { p_user_id: u.id, p_banned: false })
      setBusyId(null)
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      load(filters, page)
    } else {
      setBanTarget(u)
      setBanReason('')
    }
  }

  async function confirmBan() {
    if (!banTarget) return
    setBusyId(banTarget.id)
    const { error: rpcError } = await supabase.rpc('admin_set_user_ban', {
      p_user_id: banTarget.id,
      p_banned: true,
      p_reason: banReason.trim() || null,
    })
    setBusyId(null)
    setBanTarget(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load(filters, page)
  }

  async function toggleAdmin(u: AdminUser) {
    setBusyId(u.id)
    const { error: rpcError } = await supabase.rpc('admin_set_user_admin', { p_user_id: u.id, p_is_admin: !u.is_admin })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load(filters, page)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-moon-200/60">{total} utilisateur(s)</p>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-night-600/70 bg-night-800/50 px-3.5 py-2 text-xs font-semibold text-moon-200/80 transition-colors hover:border-moon-400/40 hover:text-moon-200"
        >
          🔍 Filtres
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-blood-600 px-1.5 py-0.5 text-[10px] text-[#fdf6e3]">{activeFilterCount}</span>
          )}
        </button>
      </div>

      <ErrorText>{error}</ErrorText>

      {users === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {users !== null && users.length === 0 && <p className="text-sm text-moon-200/50">Aucun utilisateur trouvé.</p>}

      <div className="flex flex-col gap-2">
        {users?.map((u) => (
          <Card
            key={u.id}
            className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:border-moon-400/40"
            onClick={() => setDetailId(u.id)}
          >
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-moon-200">
                {u.username}
                {u.is_admin && <span className="rounded-full bg-blood-700/20 px-2 py-0.5 text-[10px] uppercase text-blood-400">Admin</span>}
                {u.is_banned && (
                  <span className="rounded-full bg-night-600 px-2 py-0.5 text-[10px] uppercase text-moon-200/60">Suspendu</span>
                )}
              </p>
              <p className="text-xs text-moon-200/50">
                {u.email} · {u.games_count} partie(s) · inscrit le {fmtDate(u.created_at)}
              </p>
              {u.is_banned && u.banned_reason && <p className="mt-1 text-xs text-blood-400">Motif : {u.banned_reason}</p>}
            </div>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {u.id !== currentUserId && (
                <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busyId === u.id} onClick={() => toggleAdmin(u)}>
                  {u.is_admin ? 'Retirer admin' : 'Rendre admin'}
                </Button>
              )}
              {u.id !== currentUserId && (
                <Button
                  variant={u.is_banned ? 'ghost' : 'danger'}
                  className="px-3 py-1.5 text-xs"
                  disabled={busyId === u.id}
                  onClick={() => toggleBan(u)}
                >
                  {u.is_banned ? 'Réactiver' : 'Suspendre'}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-moon-200/50">
          <span>Page {page} / {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Précédent
            </Button>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Suivant →
            </Button>
          </div>
        </div>
      )}

      <SideDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtrer les utilisateurs">
        <form className="flex flex-col gap-4" onSubmit={applyFilters}>
          <div>
            <Label>Nom</Label>
            <Input placeholder="Pseudo..." value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input placeholder="Email..." value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
          </div>
          <div>
            <Label>Inscrit depuis le</Label>
            <Input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
          </div>
          <div>
            <Label>Jusqu’au</Label>
            <Input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} />
          </div>
          <div className="mt-2 flex gap-3">
            <Button type="button" variant="ghost" className="flex-1" onClick={resetFilters}>
              Réinitialiser
            </Button>
            <Button type="submit" className="flex-1">
              Appliquer
            </Button>
          </div>
        </form>
      </SideDrawer>

      {banTarget && (
        <div className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={() => setBanTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm animate-modal-in rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 p-6 shadow-card">
            <h3 className="mb-2 font-display text-lg text-moon-200">Suspendre {banTarget.username} ?</h3>
            <p className="mb-3 text-sm text-moon-200/70">
              Le compte pourra toujours se connecter, mais ne pourra plus créer ni rejoindre de partie.
            </p>
            <Input placeholder="Motif (optionnel)" value={banReason} onChange={(e) => setBanReason(e.target.value)} className="mb-4" />
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setBanTarget(null)}>
                Annuler
              </Button>
              <Button variant="danger" className="flex-1" onClick={confirmBan}>
                Suspendre
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailId && <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// ----------------------------------------------------------------------------
function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('admin_get_user_detail', { p_user_id: userId }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      setDetail(data as AdminUserDetail)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <Modal open onClose={onClose} title={detail ? detail.username : 'Fiche utilisateur'}>
      <ErrorText>{error}</ErrorText>
      {!detail && !error && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {detail && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <span className="text-moon-200/40">Email</span>
            <span className="text-moon-200">{detail.email}</span>
            <span className="text-moon-200/40">Inscrit le</span>
            <span className="text-moon-200">{fmtDate(detail.created_at)}</span>
            <span className="text-moon-200/40">Dernière connexion</span>
            <span className="text-moon-200">{detail.last_sign_in_at ? fmtDate(detail.last_sign_in_at) : '—'}</span>
            <span className="text-moon-200/40">Langue</span>
            <span className="text-moon-200">{detail.lang}</span>
            <span className="text-moon-200/40">Code ami</span>
            <span className="text-moon-200">{detail.friend_code}</span>
            <span className="text-moon-200/40">Statut</span>
            <span className="text-moon-200">
              {detail.is_admin && 'Admin '}
              {detail.is_banned ? `Suspendu${detail.banned_reason ? ` (${detail.banned_reason})` : ''}` : 'Actif'}
            </span>
          </div>

          <div className="border-t border-night-600/60 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-moon-200/50">Statistiques</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <StatCard label="Parties jouées" value={detail.stats.games_played} />
              <StatCard label="Parties gagnées" value={detail.stats.games_won} />
            </div>
            {detail.stats.by_role.length > 0 && (
              <div className="mb-3 flex flex-col gap-1">
                {detail.stats.by_role.map((r) => (
                  <div key={r.role} className="flex justify-between text-xs text-moon-200/70">
                    <span>{r.role}</span>
                    <span>
                      {r.won}/{r.played} victoire(s)
                    </span>
                  </div>
                ))}
              </div>
            )}
            {detail.stats.recent_games.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-moon-200/50">Parties récentes</p>
                {detail.stats.recent_games.slice(0, 8).map((g) => (
                  <div key={g.game_id} className="flex justify-between text-xs text-moon-200/60">
                    <span>
                      {g.code} · {g.role ?? '?'}
                    </span>
                    <span className={g.won ? 'text-emerald-400' : 'text-blood-400'}>{g.won ? 'Gagné' : 'Perdu'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ----------------------------------------------------------------------------
function GamesTab() {
  const [games, setGames] = useState<AdminGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [endTarget, setEndTarget] = useState<AdminGame | null>(null)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_active_games', { p_limit: 100 })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setGames((data ?? []) as AdminGame[])
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 8000)
    return () => clearInterval(interval)
  }, [load])

  async function confirmEnd() {
    if (!endTarget) return
    setBusyId(endTarget.id)
    const { error: rpcError } = await supabase.rpc('admin_force_end_game', { p_game_id: endTarget.id })
    setBusyId(null)
    setEndTarget(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      {games === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {games !== null && games.length === 0 && <p className="text-sm text-moon-200/50">Aucune partie en cours.</p>}

      <div className="flex flex-col gap-2">
        {games?.map((g) => (
          <Card key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold text-moon-200">
                {g.code} · {STATUS_LABELS[g.status] ?? g.status} {g.is_public && <span className="text-xs text-moon-200/40">(publique)</span>}
              </p>
              <p className="text-xs text-moon-200/50">
                Hôte : {g.host_name} · {g.player_count} joueur(s) · créée le {fmtDate(g.created_at)}
              </p>
              <p className="text-xs text-moon-200/40">Dernière activité : {timeSince(g.last_activity_at)} (ferme automatiquement après 2h)</p>
            </div>
            <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busyId === g.id} onClick={() => setEndTarget(g)}>
              Arrêter
            </Button>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={!!endTarget}
        title={`Arrêter la partie ${endTarget?.code ?? ''} ?`}
        message="La partie sera immédiatement marquée comme terminée pour tous les joueurs. Action irréversible."
        confirmLabel="Arrêter"
        cancelLabel="Annuler"
        danger
        onConfirm={confirmEnd}
        onCancel={() => setEndTarget(null)}
      />
    </div>
  )
}

// ----------------------------------------------------------------------------
function SecurityTab() {
  const [deletions, setDeletions] = useState<PendingDeletion[] | null>(null)
  const [accessLog, setAccessLog] = useState<AccessLogEntry[] | null>(null)
  const [auditLog, setAuditLog] = useState<AuditLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PendingDeletion | null>(null)

  const load = useCallback(async () => {
    const [d, a, l] = await Promise.all([
      supabase.rpc('admin_list_pending_deletions'),
      supabase.rpc('admin_list_access_log', { p_limit: 30 }),
      supabase.rpc('admin_list_audit_log', { p_limit: 50 }),
    ])
    if (d.error) setError(d.error.message)
    else setDeletions((d.data ?? []) as PendingDeletion[])
    if (!a.error) setAccessLog((a.data ?? []) as AccessLogEntry[])
    if (!l.error) setAuditLog((l.data ?? []) as AuditLogEntry[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    setSuccess(null)
    const { error: rpcError } = await supabase.rpc('admin_process_account_deletion', { p_request_id: deleteTarget.id })
    setBusyId(null)
    setDeleteTarget(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setSuccess('Compte supprimé.')
    load()
  }

  const deniedAttempts = (accessLog ?? []).filter((a) => !a.allowed)

  return (
    <div className="flex flex-col gap-6">
      <ErrorText>{error}</ErrorText>
      <SuccessText>{success}</SuccessText>

      <section>
        <h2 className="mb-2 font-display text-base text-moon-200">Demandes de suppression de compte en attente</h2>
        {deletions === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
        {deletions !== null && deletions.length === 0 && <p className="text-sm text-moon-200/50">Aucune demande en attente.</p>}
        <div className="flex flex-col gap-2">
          {deletions?.map((d) => (
            <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold text-moon-200">{d.username}</p>
                <p className="text-xs text-moon-200/50">{d.email} · demandé le {fmtDate(d.created_at)}</p>
              </div>
              <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busyId === d.id} onClick={() => setDeleteTarget(d)}>
                Supprimer le compte
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-base text-moon-200">
          Tentatives d’accès refusées {deniedAttempts.length > 0 && <span className="text-blood-400">({deniedAttempts.length})</span>}
        </h2>
        {accessLog === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
        {accessLog !== null && deniedAttempts.length === 0 && <p className="text-sm text-moon-200/50">Aucune tentative refusée récemment.</p>}
        <div className="flex flex-col gap-1.5">
          {deniedAttempts.map((a) => (
            <div key={a.id} className="rounded-lg border border-blood-700/50 bg-blood-700/10 px-3 py-2 text-xs text-blood-400">
              {a.username ?? a.user_id ?? 'Anonyme'} — refusé le {fmtDate(a.created_at)}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-base text-moon-200">Journal des actions admin</h2>
        {auditLog === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
        {auditLog !== null && auditLog.length === 0 && <p className="text-sm text-moon-200/50">Aucune action enregistrée.</p>}
        <div className="flex flex-col gap-1.5">
          {auditLog?.map((a) => (
            <div key={a.id} className="rounded-lg border border-night-600/60 bg-night-800/40 px-3 py-2 text-xs text-moon-200/70">
              <span className="text-moon-200">{a.admin_username ?? a.admin_id}</span> — {ACTION_LABELS[a.action] ?? a.action}
              {a.target && <span className="text-moon-200/40"> · {a.target}</span>} · {fmtDate(a.created_at)}
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Supprimer le compte de ${deleteTarget?.username ?? ''} ?`}
        message="Action définitive et irréversible : le compte, son profil et ses données associées seront supprimés."
        confirmLabel="Supprimer définitivement"
        cancelLabel="Annuler"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ----------------------------------------------------------------------------
function SettingsTab() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_get_stats').then(({ data, error: rpcError }) => {
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      setEnabled((data as Stats).new_games_enabled)
    })
  }, [])

  async function apply(next: boolean) {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_set_new_games_enabled', { p_enabled: next })
    setBusy(false)
    setConfirmOpen(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setEnabled(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      <Card className="p-5">
        <h2 className="mb-1 font-display text-base text-moon-200">Nouvelles parties</h2>
        <p className="mb-4 text-sm text-moon-200/60">
          Quand c’est désactivé, plus personne ne peut créer ou rejoindre une nouvelle partie. Les parties déjà en cours
          continuent normalement jusqu’à leur fin.
        </p>
        {enabled === null ? (
          <p className="text-sm text-moon-200/50">Chargement...</p>
        ) : enabled ? (
          <Button variant="danger" disabled={busy} onClick={() => setConfirmOpen(true)}>
            Désactiver les nouvelles parties
          </Button>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm font-semibold text-blood-400">⏸ Nouvelles parties désactivées</p>
            <Button disabled={busy} onClick={() => apply(true)}>
              Réactiver
            </Button>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Désactiver les nouvelles parties ?"
        message="Personne ne pourra plus créer ni rejoindre une nouvelle partie tant que ce n’est pas réactivé."
        confirmLabel="Désactiver"
        cancelLabel="Annuler"
        danger
        onConfirm={() => apply(false)}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
