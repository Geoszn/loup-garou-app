import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button, Card, ConfirmDialog, ErrorText, Input, Label, Modal, Segmented, SideDrawer, SuccessText } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { DEFAULT_ROLE_IMAGES } from '../components/RoleCard'
import { ROLES, ROLE_ORDER, type RoleId } from '../lib/roles'
import { translations, type TranslationKey } from '../i18n/translations'
import type { EventBannerColor, EventBonusType, GameEvent } from '../types/events'
import { continentEmoji, continentName } from '../lib/continents'
import { compressImageForUpload } from '../lib/imageCompress'
import { sendNotificationCampaignNow } from '../lib/pushSubscription'

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

type Tab = 'stats' | 'users' | 'games' | 'content' | 'events' | 'quests' | 'messages' | 'notifications' | 'security' | 'settings'

const TAB_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'stats', label: 'Vue d’ensemble', icon: '📊' },
  { id: 'users', label: 'Utilisateurs', icon: '👤' },
  { id: 'games', label: 'Salons', icon: '🎲' },
  { id: 'content', label: 'Contenu du jeu', icon: '📝' },
  { id: 'events', label: 'Événements', icon: '🎉' },
  // Catalogue des quêtes quotidiennes (voir QuestsCard.tsx côté joueur,
  // migration 0112) : texte/objectif/récompense/activation, sans passer par
  // un déploiement de code — même principe que l'onglet Événements ci-dessus.
  { id: 'quests', label: 'Quêtes', icon: '📜' },
  // Messages reçus des joueurs (bouton "feedback" en jeu, voir
  // FeedbackButton.tsx) : jusqu'ici uniquement envoyés par email via Resend
  // (api/feedback.ts, "best effort", pas encore configuré côté Vercel) —
  // toujours enregistrés en base quoi qu'il arrive côté email (submit_feedback,
  // migration 0056), il ne manquait qu'un écran pour les lire directement ici
  // sans dépendre de l'email (voir migration 0071).
  { id: 'messages', label: 'Messages', icon: '💬' },
  // Envoi de notifications push à tous les joueurs abonnés, immédiat ou
  // programmé, avec aperçu avant envoi (voir migration 0129,
  // NotificationsTab plus bas) — jusqu'ici seules les notifications
  // automatiques liées à un événement de jeu existaient (invitation, ami,
  // partie lancée...), rien pour une annonce libre côté admin.
  { id: 'notifications', label: 'Notifications', icon: '📣' },
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
  unread_feedback: number
  new_games_enabled: boolean
}

interface FeedbackMsg {
  id: string
  user_id: string
  username: string
  email: string
  message: string
  created_at: string
  read_at: string | null
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
  // Demandes de joueurs voulant rejoindre CETTE partie pendant qu'elle est
  // en cours (voir migration 0038) — en attente que l'hôte y réponde une
  // fois revenu en salon (JoinRequestsPanel, Lobby.tsx). L'admin les voit
  // ici (migration 0072) mais ne peut pas y répondre à sa place : c'est
  // uniquement pour repérer une partie où ça bloque.
  pending_join_requests: number
}

// Fiche détaillée d'une partie (voir admin_get_game_detail, migration
// 0109) — jamais de rôle secret dedans, uniquement de quoi comprendre
// pourquoi une partie signalée bloquée l'est réellement : la phase, son
// échéance, et qui parmi les joueurs vivants n'a pas encore agi.
interface AdminGameDetail {
  game: {
    id: string
    code: string
    status: string
    is_public: boolean
    night_number: number
    night_step: string | null
    phase_deadline: string | null
    created_at: string
    last_activity_at: string
    hunter_pending: string | null
    captain_pending: string | null
  }
  players: {
    user_id: string
    display_name: string
    is_alive: boolean
    is_host: boolean
    is_captain: boolean
    seat_number: number
    pending: boolean
  }[]
}

const NIGHT_STEP_LABELS: Record<string, string> = {
  voleur: 'Voleur',
  cupidon: 'Cupidon',
  enfant_sauvage: 'Enfant Sauvage',
  voyante: 'Voyante',
  loup_garou: 'Loups-Garous',
  sorciere: 'Sorcière',
}

const USERS_PAGE_SIZE = 10

// Filtre initial appliqué à l'onglet Utilisateurs quand on y arrive en
// cliquant sur une carte de l'onglet Vue d'ensemble (ex. "Comptes
// suspendus" -> liste déjà filtrée sur les comptes suspendus). `nonce` sert
// uniquement à distinguer deux clics sur la même carte (sinon un second
// clic avec un objet de filtre identique ne redéclencherait pas l'effet).
interface UsersSeed {
  banned?: boolean
  admin?: boolean
  createdFrom?: string
  nonce: number
}

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
  points_gained: number
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
  // Enrichissement demandé par l'admin ("plus d'informations sur le
  // compte") — déjà en base (profiles/auth.users), simplement pas encore
  // exposé ici avant migration 0084.
  email_confirmed_at: string | null
  rank_points: number
  rank_floor: number
  current_streak: number
  best_streak: number
  continent: string | null
  last_role: string | null
  role_streak: number
  username_changed_at: string | null
  friends_count: number
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
  const { user, signOut } = useAuth()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [tab, setTab] = useState<Tab>('stats')
  const [menuOpen, setMenuOpen] = useState(false)
  const [usersSeed, setUsersSeed] = useState<UsersSeed | null>(null)
  const current = TAB_ITEMS.find((t) => t.id === tab)!

  // Passée à StatsTab pour que ses cartes puissent renvoyer directement vers
  // l'onglet concerné — avec un filtre pré-appliqué quand ça a du sens (voir
  // UsersSeed ci-dessus) plutôt que la liste complète non filtrée.
  function goToTab(target: Tab, usersFilter?: Omit<UsersSeed, 'nonce'>) {
    if (target === 'users' && usersFilter) {
      setUsersSeed({ ...usersFilter, nonce: Date.now() })
    }
    setTab(target)
  }

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
          <div className="flex items-center gap-3">
            <p className="text-xs text-moon-200/50">{user?.email}</p>
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-lg border border-night-600/70 px-3 py-1.5 text-xs font-semibold text-blood-400 transition-colors hover:border-blood-600/60 hover:bg-blood-700/10"
            >
              Se déconnecter
            </button>
          </div>
        </div>

        {tab === 'stats' && <StatsTab onGoToTab={goToTab} />}
        {tab === 'users' && <UsersTab currentUserId={user?.id ?? null} seed={usersSeed} />}
        {tab === 'games' && <GamesTab />}
        {tab === 'content' && <ContentTab />}
        {tab === 'events' && <EventsTab />}
        {tab === 'quests' && <QuestTemplatesTab />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'notifications' && <NotificationsTab />}
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
function StatCard({ label, value, onClick }: { label: string; value: string | number; onClick?: () => void }) {
  return (
    <Card className={`p-4 ${onClick ? 'cursor-pointer transition-colors hover:border-moon-400/40' : ''}`} onClick={onClick}>
      <p className="text-2xl font-display text-moon-200">{value}</p>
      <p className="text-xs text-moon-200/50">{label}</p>
    </Card>
  )
}

function StatsTab({ onGoToTab }: { onGoToTab: (target: Tab, usersFilter?: Omit<UsersSeed, 'nonce'>) => void }) {
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
    <div className="flex flex-col gap-6">
      {!stats.new_games_enabled && (
        <ErrorText>Les nouvelles parties sont actuellement désactivées (voir onglet Réglages).</ErrorText>
      )}

      <StatSection title="👤 Utilisateurs">
        <StatCard label="Utilisateurs" value={stats.total_users} onClick={() => onGoToTab('users')} />
        <StatCard
          label="Nouveaux aujourd’hui"
          value={stats.new_users_today}
          onClick={() => onGoToTab('users', { createdFrom: new Date().toISOString().slice(0, 10) })}
        />
        <StatCard label="Comptes suspendus" value={stats.banned_users} onClick={() => onGoToTab('users', { banned: true })} />
        <StatCard label="Admins" value={stats.admin_users} onClick={() => onGoToTab('users', { admin: true })} />
      </StatSection>

      <StatSection title="🎲 Parties">
        <StatCard label="Parties (total)" value={stats.total_games} />
        <StatCard label="Parties en cours" value={stats.active_games} onClick={() => onGoToTab('games')} />
        <StatCard label="Parties créées aujourd’hui" value={stats.games_today} />
        {/* Joueurs qui essaient de rejoindre une partie déjà en cours (ou
            privée rejointe par code pendant qu'elle tourne, voir migration
            0038) : la demande reste en attente jusqu'à ce que l'HÔTE de
            cette partie précise y réponde, une fois revenu en salon — pas
            une file d'attente globale que l'admin traite lui-même. Ce
            compteur n'avait jusqu'ici aucune action associée (pas de clic) ;
            il renvoie maintenant vers l'onglet Parties, qui affiche
            désormais laquelle a des demandes en attente (migration 0072).
            (Question fréquente, réponse : c'est géré par l'hôte, pas ici.) */}
        <StatCard label="Demandes d’accès en attente" value={stats.pending_join_requests} onClick={() => onGoToTab('games')} />
      </StatSection>

      {/* Deux compteurs qui portent tous les deux le mot "message" mais qui
          n'ont rien à voir : l'un compte les messages du chat EN PARTIE
          (village/loups/cimetière) envoyés aujourd'hui — une simple mesure
          d'activité, sans action à faire dessus. L'autre compte les retours
          joueurs (bouton feedback) pas encore lus, cliquable vers l'onglet
          Messages (voir migration 0071). Regroupés dans la même section mais
          avec des libellés qui ne peuvent plus se confondre. */}
      <StatSection title="💬 Activité & messages">
        <StatCard label="Messages de chat (aujourd’hui)" value={stats.messages_today} />
        <StatCard label="Retours joueurs non lus" value={stats.unread_feedback} onClick={() => onGoToTab('messages')} />
      </StatSection>

      <StatSection title="🔒 Compte & sécurité">
        <StatCard label="Suppressions en attente" value={stats.pending_deletions} onClick={() => onGoToTab('security')} />
      </StatSection>
    </div>
  )
}

/** Petit regroupement titré de StatCard — juste un titre + une grille,
 * réutilisé par chaque catégorie de StatsTab (voir retour utilisateur :
 * la grille unique de 11 cartes était difficile à parcourir d'un coup
 * d'œil, en particulier pour distinguer les deux compteurs "message..."). */
function StatSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-sm uppercase tracking-wide text-moon-200/50">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </section>
  )
}

// ----------------------------------------------------------------------------
function UsersTab({ currentUserId, seed }: { currentUserId: string | null; seed: UsersSeed | null }) {
  // Champs du formulaire de filtre (état "brouillon", pas encore appliqué) —
  // séparés de ce qui a vraiment été envoyé au serveur pour ne relancer une
  // recherche qu'à la soumission du formulaire, pas à chaque frappe.
  const [usernameInput, setUsernameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [bannedOnlyInput, setBannedOnlyInput] = useState(false)
  const [adminOnlyInput, setAdminOnlyInput] = useState(false)
  const [filters, setFilters] = useState({ username: '', email: '', from: '', to: '', bannedOnly: false, adminOnly: false })
  const [page, setPage] = useState(1)

  // Arrivée depuis une carte de l'onglet Vue d'ensemble (ex. "Comptes
  // suspendus") : applique le filtre correspondant directement, sans que
  // l'admin ait à rouvrir le tiroir de filtres lui-même.
  useEffect(() => {
    if (!seed) return
    const next = {
      username: '',
      email: '',
      from: seed.createdFrom ?? '',
      to: '',
      bannedOnly: !!seed.banned,
      adminOnly: !!seed.admin,
    }
    setUsernameInput('')
    setEmailInput('')
    setFromInput(next.from)
    setToInput('')
    setBannedOnlyInput(next.bannedOnly)
    setAdminOnlyInput(next.adminOnly)
    setFilters(next)
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce])

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
      p_banned_only: f.bannedOnly,
      p_admin_only: f.adminOnly,
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
    setFilters({ username: usernameInput, email: emailInput, from: fromInput, to: toInput, bannedOnly: bannedOnlyInput, adminOnly: adminOnlyInput })
    setFiltersOpen(false)
  }

  function resetFilters() {
    setUsernameInput('')
    setEmailInput('')
    setFromInput('')
    setToInput('')
    setBannedOnlyInput(false)
    setAdminOnlyInput(false)
    setPage(1)
    setFilters({ username: '', email: '', from: '', to: '', bannedOnly: false, adminOnly: false })
    setFiltersOpen(false)
  }

  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount = [filters.username, filters.email, filters.from, filters.to, filters.bannedOnly, filters.adminOnly].filter(
    Boolean
  ).length

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
          <label className="flex items-center gap-2 text-sm text-moon-200/80">
            <input
              type="checkbox"
              checked={bannedOnlyInput}
              onChange={(e) => setBannedOnlyInput(e.target.checked)}
              className="h-4 w-4 rounded border-night-600/70 bg-night-900/50 accent-blood-600"
            />
            Suspendus uniquement
          </label>
          <label className="flex items-center gap-2 text-sm text-moon-200/80">
            <input
              type="checkbox"
              checked={adminOnlyInput}
              onChange={(e) => setAdminOnlyInput(e.target.checked)}
              className="h-4 w-4 rounded border-night-600/70 bg-night-900/50 accent-blood-600"
            />
            Admins uniquement
          </label>
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
            <span className="text-moon-200">
              {detail.email}
              {detail.email_confirmed_at ? (
                <span className="ml-1 text-emerald-400" title={`Confirmé le ${fmtDate(detail.email_confirmed_at)}`}>
                  ✓
                </span>
              ) : (
                <span className="ml-1 text-blood-400" title="Email non confirmé">
                  ✕
                </span>
              )}
            </span>
            <span className="text-moon-200/40">Inscrit le</span>
            <span className="text-moon-200">{fmtDate(detail.created_at)}</span>
            <span className="text-moon-200/40">Dernière connexion</span>
            <span className="text-moon-200">{detail.last_sign_in_at ? fmtDate(detail.last_sign_in_at) : '—'}</span>
            <span className="text-moon-200/40">Langue</span>
            <span className="text-moon-200">{detail.lang}</span>
            <span className="text-moon-200/40">Continent</span>
            <span className="text-moon-200">
              {detail.continent ? `${continentEmoji(detail.continent)} ${continentName(detail.continent, 'fr')}` : '—'}
            </span>
            <span className="text-moon-200/40">Code ami</span>
            <span className="text-moon-200">{detail.friend_code}</span>
            <span className="text-moon-200/40">Amis</span>
            <span className="text-moon-200">{detail.friends_count}</span>
            <span className="text-moon-200/40">Pseudo modifié</span>
            <span className="text-moon-200">{detail.username_changed_at ? fmtDate(detail.username_changed_at) : 'Jamais'}</span>
            <span className="text-moon-200/40">Statut</span>
            <span className="text-moon-200">
              {detail.is_admin && 'Admin '}
              {detail.is_banned ? `Suspendu${detail.banned_reason ? ` (${detail.banned_reason})` : ''}` : 'Actif'}
            </span>
          </div>

          <div className="border-t border-night-600/60 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-moon-200/50">Classement</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <StatCard label="Points" value={detail.rank_points} />
              <StatCard label="Plancher de palier" value={detail.rank_floor} />
              <StatCard label="Série en cours" value={detail.current_streak} />
              <StatCard label="Meilleure série" value={detail.best_streak} />
            </div>
            {detail.last_role && (
              <p className="text-xs text-moon-200/60">
                Dernier rôle joué : <span className="text-moon-200">{detail.last_role}</span>
                {detail.role_streak > 1 && ` (${detail.role_streak} fois de suite)`}
              </p>
            )}
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
                    <span className={g.won ? 'text-emerald-400' : 'text-blood-400'}>
                      {g.won ? 'Gagné' : 'Perdu'} ({g.points_gained >= 0 ? '+' : ''}
                      {g.points_gained})
                    </span>
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
  // Filtre client (pas de nouvel aller-retour réseau) : la liste tient déjà
  // entièrement en mémoire (p_limit: 100), pas besoin d'une recherche
  // côté serveur pour ce volume. Cherche sur le code ET le nom de l'hôte —
  // c'est par l'un ou l'autre qu'un signalement support arrive en général
  // ("le joueur X n'arrive pas à..." / "la partie ABCD est bloquée").
  const [search, setSearch] = useState('')
  // Fiche détaillée ouverte (voir GameDetailModal plus bas) — id de partie
  // uniquement, pour ne jamais garder une copie de AdminGame qui pourrait
  // devenir périmée pendant que la modale reste ouverte.
  const [detailId, setDetailId] = useState<string | null>(null)

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

  const needle = search.trim().toLowerCase()
  const filteredGames = games?.filter(
    (g) => !needle || g.code.toLowerCase().includes(needle) || g.host_name.toLowerCase().includes(needle)
  )

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher par code ou par hôte..."
        className="max-w-sm"
      />
      {games === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {games !== null && games.length === 0 && <p className="text-sm text-moon-200/50">Aucune partie en cours.</p>}
      {games !== null && games.length > 0 && filteredGames?.length === 0 && (
        <p className="text-sm text-moon-200/50">Aucune partie ne correspond à "{search}".</p>
      )}

      <div className="flex flex-col gap-2">
        {filteredGames?.map((g) => (
          <Card key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold text-moon-200">
                {g.code} · {STATUS_LABELS[g.status] ?? g.status} {g.is_public && <span className="text-xs text-moon-200/40">(publique)</span>}
              </p>
              <p className="text-xs text-moon-200/50">
                Hôte : {g.host_name} · {g.player_count} joueur(s) · créée le {fmtDate(g.created_at)}
              </p>
              <p className="text-xs text-moon-200/40">Dernière activité : {timeSince(g.last_activity_at)} (ferme automatiquement après 2h)</p>
              {/* Demandes de joueurs voulant rejoindre CETTE partie en cours
                  (voir migration 0038/0072) — seul l'hôte peut y répondre
                  (JoinRequestsPanel, une fois revenu en salon), affiché ici
                  juste pour repérer une partie où ça bloque. */}
              {g.pending_join_requests > 0 && (
                <p className="mt-1 text-xs text-moon-300">
                  🔔 {g.pending_join_requests} demande(s) d’accès en attente — à valider par l’hôte, une fois revenu au salon.
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setDetailId(g.id)}>
                Voir le détail
              </Button>
              <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busyId === g.id} onClick={() => setEndTarget(g)}>
                Arrêter
              </Button>
            </div>
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

      {detailId && <GameDetailModal gameId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

/** Fiche détaillée d'une partie (voir admin_get_game_detail, migration
 * 0109) — pour comprendre pourquoi une partie signalée bloquée l'est
 * réellement, sans passer par la base directement. Se recharge toutes les
 * 5s tant qu'elle est ouverte (comme la liste elle-même), pour suivre un
 * blocage en train de se résoudre sans avoir à fermer/rouvrir. */
function GameDetailModal({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminGameDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_get_game_detail', { p_game_id: gameId })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setDetail(data as AdminGameDetail)
  }, [gameId])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  const pendingCount = detail?.players.filter((p) => p.pending).length ?? 0

  return (
    <Modal open onClose={onClose} title={detail ? `Partie ${detail.game.code}` : 'Partie'}>
      <ErrorText>{error}</ErrorText>
      {!detail && !error && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {detail && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-night-600/60 bg-night-900/40 p-3 text-sm">
            <p className="text-moon-200">
              {STATUS_LABELS[detail.game.status] ?? detail.game.status}
              {detail.game.status === 'night' && detail.game.night_step && (
                <> · {NIGHT_STEP_LABELS[detail.game.night_step] ?? detail.game.night_step}</>
              )}
              {detail.game.night_number > 0 && <> · Nuit {detail.game.night_number}</>}
            </p>
            <p className="mt-1 text-xs text-moon-200/50">
              Dernière activité : {timeSince(detail.game.last_activity_at)}
              {detail.game.phase_deadline && <> · échéance de phase {fmtDate(detail.game.phase_deadline)}</>}
            </p>
            {/* hunter_pending/captain_pending bloquent la partie pour TOUT
                le monde (pas seulement l'acteur concerné) jusqu'à ce que ce
                joueur précis agisse — souvent la cause d'un blocage signalé
                "tout le monde attend sans rien pouvoir faire". */}
            {detail.game.hunter_pending && (
              <p className="mt-1 text-xs text-blood-400">
                🎯 En attente du tir du Chasseur ({detail.players.find((p) => p.user_id === detail.game.hunter_pending)?.display_name ?? '?'})
              </p>
            )}
            {detail.game.captain_pending && (
              <p className="mt-1 text-xs text-blood-400">
                🎖️ En attente de la succession du Capitaine ({detail.players.find((p) => p.user_id === detail.game.captain_pending)?.display_name ?? '?'})
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-moon-200/50">
              Joueurs {pendingCount > 0 && <span className="text-blood-400">· {pendingCount} en attente</span>}
            </p>
            <div className="flex flex-col gap-1.5">
              {detail.players.map((p) => (
                <div
                  key={p.user_id}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                    p.pending ? 'border-blood-700/50 bg-blood-700/10' : 'border-night-600/60 bg-night-800/40'
                  }`}
                >
                  <span className={p.is_alive ? 'text-moon-200' : 'text-moon-200/40 line-through'}>
                    {p.display_name}
                    {p.is_host && ' · 👑'}
                    {p.is_captain && ' · 🎖️'}
                  </span>
                  {p.pending && <span className="shrink-0 font-semibold text-blood-400">en attente</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ----------------------------------------------------------------------------
// Contenu du jeu : deux sections indépendantes.
//   1. Textes (role.*/rules.*) — voir migration 0053, content_overrides.
//   2. Illustrations des cartes de rôle — voir migration 0053, bucket de
//      stockage "role-cards".
// ----------------------------------------------------------------------------

type ContentOverridesMap = Record<string, { fr: string | null; en: string | null }>

interface EditableField {
  key: TranslationKey
  label: string
}

const EDITABLE_ROLE_FIELDS: EditableField[] = ROLE_ORDER.flatMap((id) => {
  const role = ROLES[id]
  const roleName = translations[role.nameKey].fr
  const fields: EditableField[] = [
    { key: role.nameKey, label: `${role.emoji} ${roleName} — nom` },
    { key: role.descriptionKey, label: `${role.emoji} ${roleName} — description` },
  ]
  if (role.nightActionKey) {
    fields.push({ key: role.nightActionKey, label: `${role.emoji} ${roleName} — action de nuit` })
  }
  return fields
})

const RULES_FIELD_LABELS: Partial<Record<TranslationKey, string>> = {
  'rules.title': 'Titre du panneau de règles',
  'rules.objective.title': 'Objectif — titre',
  'rules.objective.text': 'Objectif — texte',
  'rules.flow.title': 'Déroulement — titre',
  'rules.flow.text': 'Déroulement — texte',
  'rules.nightChat.title': 'Chat de nuit — titre',
  'rules.nightChat.text': 'Chat de nuit — texte',
  'rules.roles.title': 'Section « Les rôles » — titre',
  'rules.captain.title': 'Capitaine — titre',
  'rules.captain.text': 'Capitaine — texte',
  'rules.victory.title': 'Victoire — titre',
  'rules.victory.text': 'Victoire — texte',
}

const EDITABLE_RULES_FIELDS: EditableField[] = (Object.keys(RULES_FIELD_LABELS) as TranslationKey[]).map((key) => ({
  key,
  label: RULES_FIELD_LABELS[key]!,
}))

function ContentTab() {
  const [overrides, setOverrides] = useState<ContentOverridesMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_content_overrides')
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setOverrides((data ?? {}) as ContentOverridesMap)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const q = filter.trim().toLowerCase()
  const roleFields = EDITABLE_ROLE_FIELDS.filter((f) => !q || f.label.toLowerCase().includes(q))
  const rulesFields = EDITABLE_RULES_FIELDS.filter((f) => !q || f.label.toLowerCase().includes(q))

  return (
    <div className="flex flex-col gap-6">
      <ErrorText>{error}</ErrorText>

      <RoleImagesSection />

      <Input placeholder="🔍 Filtrer les textes..." value={filter} onChange={(e) => setFilter(e.target.value)} />

      {overrides === null ? (
        <p className="text-sm text-moon-200/50">Chargement...</p>
      ) : (
        <>
          {roleFields.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-base text-moon-200">Textes des rôles</h2>
              <div className="flex flex-col gap-3">
                {roleFields.map((f) => (
                  <ContentField key={f.key} fieldKey={f.key} label={f.label} override={overrides[f.key]} onSaved={load} />
                ))}
              </div>
            </section>
          )}

          {rulesFields.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-base text-moon-200">Règles générales</h2>
              <div className="flex flex-col gap-3">
                {rulesFields.map((f) => (
                  <ContentField key={f.key} fieldKey={f.key} label={f.label} override={overrides[f.key]} onSaved={load} />
                ))}
              </div>
            </section>
          )}

          {roleFields.length === 0 && rulesFields.length === 0 && (
            <p className="text-sm text-moon-200/50">Aucun texte ne correspond à « {filter} ».</p>
          )}
        </>
      )}
    </div>
  )
}

/** Une ligne éditable : texte par défaut (codé en dur, affiché en
 * placeholder) + override FR/EN facultatif. `key` sur le composant parent
 * garantit une instance stable par champ ; on resynchronise quand même
 * l'état local sur `override` via useEffect, au cas où le chargement initial
 * arrive après le premier rendu (overrides passe de `undefined` à sa vraie
 * valeur une fois la requête terminée). */
function ContentField({
  fieldKey,
  label,
  override,
  onSaved,
}: {
  fieldKey: TranslationKey
  label: string
  override?: { fr: string | null; en: string | null }
  onSaved: () => void
}) {
  const defaultFr = translations[fieldKey]?.fr ?? ''
  const defaultEn = translations[fieldKey]?.en ?? ''
  const [fr, setFr] = useState(override?.fr ?? '')
  const [en, setEn] = useState(override?.en ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFr(override?.fr ?? '')
    setEn(override?.en ?? '')
  }, [override?.fr, override?.en])

  const hasOverride = !!(override?.fr || override?.en)

  async function save() {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_set_content_override', {
      p_key: fieldKey,
      p_text_fr: fr,
      p_text_en: en,
    })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onSaved()
  }

  async function reset() {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_delete_content_override', { p_key: fieldKey })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onSaved()
  }

  const textareaClass =
    'w-full rounded-xl border border-night-500 bg-night-800/80 px-3 py-2 text-sm text-moon-200 placeholder:text-moon-200/30 outline-none transition focus:border-moon-400/60 focus:ring-2 focus:ring-moon-400/20'

  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-moon-200">
        {label}
        {hasOverride && (
          <span className="rounded-full bg-blood-700/20 px-2 py-0.5 text-[10px] uppercase text-blood-400">Modifié</span>
        )}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Français</Label>
          <textarea rows={2} value={fr} placeholder={defaultFr} onChange={(e) => setFr(e.target.value)} className={textareaClass} />
        </div>
        <div>
          <Label>English</Label>
          <textarea rows={2} value={en} placeholder={defaultEn} onChange={(e) => setEn(e.target.value)} className={textareaClass} />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="mt-3 flex gap-2">
        <Button className="px-3 py-1.5 text-xs" disabled={busy} onClick={save}>
          Enregistrer
        </Button>
        {hasOverride && (
          <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy} onClick={reset}>
            Revenir au texte par défaut
          </Button>
        )}
      </div>
    </Card>
  )
}

/** Illustration de chaque carte de rôle : bouton d'upload (remplace l'image
 * dans le bucket "role-cards", toujours au chemin "{roleId}.jpg" quel que
 * soit le format importé — voir roleCardImageCandidates dans RoleCard.tsx)
 * et lien de téléchargement de l'image actuellement affichée aux joueurs
 * (celle du bucket si elle existe, sinon l'asset bundlé par défaut). */
function RoleImagesSection() {
  const [overriddenIds, setOverriddenIds] = useState<Set<string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyRole, setBusyRole] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: listError } = await supabase.storage.from('role-cards').list('')
    if (listError) {
      setError(listError.message)
      return
    }
    setError(null)
    setOverriddenIds(new Set((data ?? []).map((f) => f.name.replace(/\.[^.]+$/, ''))))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleUpload(roleId: RoleId, file: File) {
    setBusyRole(roleId)
    setError(null)
    // Redimensionne/compresse avant l'envoi (voir imageCompress.ts) : une
    // carte de rôle ne s'affiche jamais au-delà de ~320px de large (voir
    // RoleCard.tsx, max-w-xs) — inutile de faire télécharger à chaque
    // joueur la photo brute d'un téléphone (souvent plusieurs Mo). 900×1350
    // couvre confortablement l'affichage en écran retina. En cas d'échec de
    // compression (très vieux navigateur), on retombe sur le fichier
    // original plutôt que de bloquer l'upload.
    let toUpload: Blob = file
    try {
      toUpload = await compressImageForUpload(file, { maxWidth: 900, maxHeight: 1350 })
    } catch {
      // ignore, on envoie l'original
    }
    const { error: uploadError } = await supabase.storage.from('role-cards').upload(`${roleId}.jpg`, toUpload, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '300',
    })
    setBusyRole(null)
    if (uploadError) {
      setError(uploadError.message)
      return
    }
    load()
  }

  return (
    <section>
      <h2 className="mb-1 font-display text-base text-moon-200">Cartes des rôles</h2>
      <p className="mb-3 text-xs text-moon-200/50">
        Remplace l’illustration affichée sur la carte de chaque rôle (format portrait, mêmes proportions que les cartes
        actuelles). Le changement peut prendre quelques minutes à apparaître pour les joueurs déjà en jeu (mise en cache du
        navigateur).
      </p>
      <ErrorText>{error}</ErrorText>
      {overriddenIds === null ? (
        <p className="text-sm text-moon-200/50">Chargement...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {ROLE_ORDER.filter((id) => id !== 'villageois').map((id) => {
            const role = ROLES[id]
            const overridden = overriddenIds.has(id)
            const currentUrl = overridden
              ? supabase.storage.from('role-cards').getPublicUrl(`${id}.jpg`).data.publicUrl
              : DEFAULT_ROLE_IMAGES[id]
            return (
              <Card key={id} className="p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-moon-200">
                  {role.emoji} {translations[role.nameKey].fr}
                </p>
                <div className="mb-2 flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg border border-night-600/60 bg-night-800/60">
                  {currentUrl ? (
                    <img src={currentUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl opacity-40">{role.emoji}</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="cursor-pointer rounded-lg border border-night-600/70 bg-night-800/50 px-2 py-1.5 text-center text-[11px] font-semibold text-moon-200/80 transition-colors hover:border-moon-400/40">
                    {busyRole === id ? '...' : '📤 Changer l’image'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busyRole === id}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUpload(id, file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {currentUrl && (
                    <a
                      href={currentUrl}
                      download={`${id}.jpg`}
                      className="rounded-lg border border-night-600/70 bg-night-800/50 px-2 py-1.5 text-center text-[11px] font-semibold text-moon-200/80 transition-colors hover:border-moon-400/40"
                    >
                      ⬇️ Télécharger l’actuelle
                    </a>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ----------------------------------------------------------------------------
// Événements : voir migration 0067. Un événement actif affiche une bannière
// sur Landing.tsx et peut donner un bonus de points (fixe ou multiplicateur)
// appliqué dans apply_rank_result. Une seule fonction serveur
// (admin_upsert_event) gère à la fois la création et la modification —
// même principe que ContentField plus haut.
// ----------------------------------------------------------------------------

const BONUS_TYPE_LABELS: Record<EventBonusType, string> = {
  none: 'Aucun (bannière seule)',
  flat: 'Bonus de points fixe',
  multiplier: 'Multiplicateur de points',
}

const BANNER_COLOR_SWATCHES: Record<EventBannerColor, string> = {
  gold: 'bg-moon-400',
  blood: 'bg-blood-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
}

// Format attendu par <input type="datetime-local"> : "AAAA-MM-JJTHH:mm", en
// heure locale du navigateur de l'admin — converti en ISO (UTC) uniquement
// à l'envoi (voir toIsoString), et reconverti en local à l'édition (voir
// toDatetimeLocal) pour que le formulaire réaffiche l'heure telle qu'elle a
// été saisie.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Relecture explicite en 24h, affichée sous chaque champ Début/Fin (voir
// EventForm ci-dessous) — retour utilisateur : le picker natif Safari
// affiche l'heure au format 12h sans AM/PM clairement visible, impossible
// de vérifier avant d'enregistrer si "12:00" est midi ou minuit. Recalculée
// depuis la même valeur "AAAA-MM-JJTHH:mm" que l'input (jamais reparsée
// séparément), donc toujours cohérente avec ce qui sera réellement
// enregistré — pas un simple habillage visuel déconnecté de la vraie donnée.
function formatDatetimeLocalReadable(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

// Heure saisie via deux <select> 24h (00-23 / 00-15-30-45) plutôt que le
// widget natif <input type="time">/"datetime-local" — retour utilisateur :
// même avec la relecture en toutes lettres ajoutée sous le champ, le picker
// natif Safari lui-même reste au format 12h (roue avec bascule AM/PM), donc
// l'ambiguïté restait entière PENDANT la saisie, avant même de regarder la
// relecture. Un menu déroulant "00".."23" n'a tout simplement pas de notion
// AM/PM à confondre — plus robuste qu'un simple indice textuel à côté d'un
// widget qui reste, lui, ambigu.
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
// Toutes les minutes (pas seulement les quarts d'heure) : un événement déjà
// enregistré avec une minute "impaire" (ex. 09:18) doit pouvoir se réafficher
// tel quel dans ce menu sans qu'aucune option ne corresponde — ce qui
// laisserait le menu paraître vide côté écran tout en gardant la valeur
// réelle inchangée en mémoire, donc trompeur à l'affichage.
const MINUTES_ALL = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

function splitDatetimeLocal(value: string): { date: string; hour: string; minute: string } {
  if (!value) return { date: '', hour: '18', minute: '00' }
  const [date, time] = value.split('T')
  const [hour, minute] = (time ?? '18:00').split(':')
  return { date, hour: hour ?? '18', minute: minute ?? '00' }
}

// Ne recombine que si une date a déjà été choisie : changer l'heure/minute
// avant la date ne doit pas faire apparaître silencieusement une valeur par
// défaut aujourd'hui non voulue pour un événement futur — le champ Début/Fin
// reste vide (donc le formulaire refuse d'enregistrer, voir plus bas) tant
// que la date n'a pas été explicitement posée.
function combineDatetimeLocal(date: string, hour: string, minute: string): string {
  if (!date) return ''
  return `${date}T${hour}:${minute}`
}

const dateTimeSelectClass =
  'rounded-xl border border-night-500 bg-night-800/80 px-2 py-3 text-sm text-moon-200 outline-none transition focus:border-moon-400/60 focus:ring-2 focus:ring-moon-400/20'

function eventStatus(e: GameEvent): { label: string; className: string } {
  if (!e.is_enabled) return { label: 'Désactivé', className: 'bg-night-600 text-moon-200/60' }
  const now = Date.now()
  const previewStart = e.preview_starts_at ? new Date(e.preview_starts_at).getTime() : null
  const start = new Date(e.starts_at).getTime()
  const end = new Date(e.ends_at).getTime()
  // Distingue "bannière déjà visible mais bonus pas encore actif" (aperçu,
  // voir migration 0075) de "rien n'est encore visible" — sans ça, un admin
  // pourrait croire qu'un événement en aperçu n'apparaît nulle part côté
  // joueur alors que sa bannière tourne déjà.
  if (previewStart !== null && now >= previewStart && now < start) {
    return { label: 'Aperçu (bannière visible)', className: 'bg-moon-400/20 text-moon-300' }
  }
  if (now < start) return { label: 'Programmé', className: 'bg-night-600 text-moon-200/70' }
  if (now > end) return { label: 'Terminé', className: 'bg-night-600 text-moon-200/50' }
  return { label: 'En cours', className: 'bg-emerald-700/30 text-emerald-400' }
}

function bonusSummary(e: GameEvent): string | null {
  if (e.bonus_type === 'flat') return `+${e.bonus_value} pts par victoire`
  if (e.bonus_type === 'multiplier') return `×${e.bonus_value} points par victoire`
  return null
}

interface EventFormState {
  name: string
  starts_at: string
  ends_at: string
  // Vide = pas d'aperçu (comportement d'avant, voir migration 0075) —
  // distinct de starts_at/ends_at qui, eux, sont obligatoires.
  preview_starts_at: string
  bonus_type: EventBonusType
  bonus_value: string
  banner_text_fr: string
  banner_text_en: string
  banner_color: EventBannerColor
  is_enabled: boolean
}

const EMPTY_EVENT_FORM: EventFormState = {
  name: '',
  starts_at: '',
  ends_at: '',
  preview_starts_at: '',
  bonus_type: 'none',
  bonus_value: '0',
  banner_text_fr: '',
  banner_text_en: '',
  banner_color: 'gold',
  is_enabled: true,
}

function EventsTab() {
  const [events, setEvents] = useState<GameEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GameEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GameEvent | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_events')
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setEvents((data ?? []) as GameEvent[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(e: GameEvent) {
    setEditing(e)
    setFormOpen(true)
  }

  async function toggleEnabled(e: GameEvent) {
    setBusyId(e.id)
    const { error: rpcError } = await supabase.rpc('admin_upsert_event', {
      p_id: e.id,
      p_name: e.name,
      p_starts_at: e.starts_at,
      p_ends_at: e.ends_at,
      p_bonus_type: e.bonus_type,
      p_bonus_value: e.bonus_value,
      p_banner_text_fr: e.banner_text_fr,
      p_banner_text_en: e.banner_text_en,
      p_banner_color: e.banner_color,
      p_is_enabled: !e.is_enabled,
      // admin_upsert_event réécrit toutes les colonnes à chaque appel (pas
      // une mise à jour partielle) — omettre ce champ le remettrait
      // silencieusement à null (sa valeur par défaut) à chaque bascule
      // Activer/Désactiver, effaçant un aperçu déjà configuré.
      p_preview_starts_at: e.preview_starts_at,
    })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    const { error: rpcError } = await supabase.rpc('admin_delete_event', { p_id: deleteTarget.id })
    setBusyId(null)
    setDeleteTarget(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-moon-200/60">{events?.length ?? 0} événement(s)</p>
        <Button className="px-3.5 py-2 text-xs" onClick={openCreate}>
          + Nouvel événement
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      {events === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {events !== null && events.length === 0 && <p className="text-sm text-moon-200/50">Aucun événement créé.</p>}

      <div className="flex flex-col gap-2">
        {events?.map((e) => {
          const status = eventStatus(e)
          const bonus = bonusSummary(e)
          return (
            <Card key={e.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-moon-200">
                    <span className={`h-2.5 w-2.5 rounded-full ${BANNER_COLOR_SWATCHES[e.banner_color]}`} />
                    {e.name}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${status.className}`}>{status.label}</span>
                  </p>
                  <p className="mt-1 text-xs text-moon-200/50">
                    Du {fmtDate(e.starts_at)} au {fmtDate(e.ends_at)}
                    {bonus && <span className="text-moon-300"> · {bonus}</span>}
                  </p>
                  {e.preview_starts_at && (
                    <p className="mt-0.5 text-xs text-moon-300/70">🔜 Bannière visible dès {fmtDate(e.preview_starts_at)}</p>
                  )}
                  {(e.banner_text_fr || e.banner_text_en) && (
                    <p className="mt-1 text-xs text-moon-200/40">
                      🇫🇷 {e.banner_text_fr || '—'} · 🇬🇧 {e.banner_text_en || '—'}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busyId === e.id} onClick={() => openEdit(e)}>
                    Modifier
                  </Button>
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busyId === e.id} onClick={() => toggleEnabled(e)}>
                    {e.is_enabled ? 'Désactiver' : 'Activer'}
                  </Button>
                  <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busyId === e.id} onClick={() => setDeleteTarget(e)}>
                    Supprimer
                  </Button>
                </div>
              </div>
              <EventBannerImages event={e} onUploaded={load} />
            </Card>
          )
        })}
      </div>

      <EventFormDrawer
        open={formOpen}
        event={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false)
          load()
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Supprimer « ${deleteTarget?.name ?? ''} » ?`}
        message="La bannière disparaîtra immédiatement de la page d'accueil si l'événement est en cours. Action irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

/** Formulaire de création/édition, dans un tiroir — même schéma que le
 * tiroir de filtres de UsersTab. `event` fourni = édition (formulaire
 * pré-rempli), `null` = création. */
function EventFormDrawer({
  open,
  event,
  onClose,
  onSaved,
}: {
  open: boolean
  event: GameEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<EventFormState>(EMPTY_EVENT_FORM)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (event) {
      setForm({
        name: event.name,
        starts_at: toDatetimeLocal(event.starts_at),
        ends_at: toDatetimeLocal(event.ends_at),
        preview_starts_at: event.preview_starts_at ? toDatetimeLocal(event.preview_starts_at) : '',
        bonus_type: event.bonus_type,
        bonus_value: String(event.bonus_value),
        banner_text_fr: event.banner_text_fr,
        banner_text_en: event.banner_text_en,
        banner_color: event.banner_color,
        is_enabled: event.is_enabled ?? true,
      })
    } else {
      setForm(EMPTY_EVENT_FORM)
    }
    setError(null)
  }, [open, event])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.starts_at || !form.ends_at) {
      setError('Nom et période requis.')
      return
    }
    if (form.preview_starts_at && form.preview_starts_at > form.starts_at) {
      // Comparaison de chaînes valide ici : même format "AAAA-MM-JJTHH:mm"
      // des deux côtés (ordre lexicographique = ordre chronologique).
      setError('L’aperçu doit commencer avant (ou en même temps que) le début de l’événement.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_upsert_event', {
      p_id: event?.id ?? null,
      p_name: form.name,
      p_starts_at: new Date(form.starts_at).toISOString(),
      p_ends_at: new Date(form.ends_at).toISOString(),
      p_preview_starts_at: form.preview_starts_at ? new Date(form.preview_starts_at).toISOString() : null,
      p_bonus_type: form.bonus_type,
      p_bonus_value: Number(form.bonus_value) || 0,
      p_banner_text_fr: form.banner_text_fr,
      p_banner_text_en: form.banner_text_en,
      p_banner_color: form.banner_color,
      p_is_enabled: form.is_enabled,
    })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onSaved()
  }

  const textareaClass =
    'w-full rounded-xl border border-night-500 bg-night-800/80 px-3 py-2 text-sm text-moon-200 placeholder:text-moon-200/30 outline-none transition focus:border-moon-400/60 focus:ring-2 focus:ring-moon-400/20'

  return (
    <SideDrawer open={open} onClose={onClose} title={event ? 'Modifier l’événement' : 'Nouvel événement'}>
      <form className="flex flex-col gap-4" onSubmit={save}>
        <div>
          <Label>Nom (interne, pas affiché aux joueurs)</Label>
          <Input value={form.name} onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))} placeholder="Ex. Week-end Halloween" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Début</Label>
            <div className="flex gap-1.5">
              <Input
                type="date"
                className="flex-1"
                value={splitDatetimeLocal(form.starts_at).date}
                onChange={(ev) => {
                  const { hour, minute } = splitDatetimeLocal(form.starts_at)
                  setForm((f) => ({ ...f, starts_at: combineDatetimeLocal(ev.target.value, hour, minute) }))
                }}
              />
              <select
                aria-label="Heure de début (24h)"
                className={dateTimeSelectClass}
                value={splitDatetimeLocal(form.starts_at).hour}
                onChange={(ev) => {
                  const { date, minute } = splitDatetimeLocal(form.starts_at)
                  setForm((f) => ({ ...f, starts_at: combineDatetimeLocal(date, ev.target.value, minute) }))
                }}
              >
                {HOURS_24.map((h) => (
                  <option key={h} value={h}>
                    {h}h
                  </option>
                ))}
              </select>
              <select
                aria-label="Minute de début"
                className={dateTimeSelectClass}
                value={splitDatetimeLocal(form.starts_at).minute}
                onChange={(ev) => {
                  const { date, hour } = splitDatetimeLocal(form.starts_at)
                  setForm((f) => ({ ...f, starts_at: combineDatetimeLocal(date, hour, ev.target.value) }))
                }}
              >
                {MINUTES_ALL.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {/* Relecture en toutes lettres, en plus des menus 24h déjà sans
                ambiguïté — double confirmation avant d'enregistrer. */}
            {formatDatetimeLocalReadable(form.starts_at) && (
              <p className="mt-1 text-[11px] text-moon-200/40">→ {formatDatetimeLocalReadable(form.starts_at)}</p>
            )}
          </div>
          <div>
            <Label>Fin</Label>
            <div className="flex gap-1.5">
              <Input
                type="date"
                className="flex-1"
                value={splitDatetimeLocal(form.ends_at).date}
                onChange={(ev) => {
                  const { hour, minute } = splitDatetimeLocal(form.ends_at)
                  setForm((f) => ({ ...f, ends_at: combineDatetimeLocal(ev.target.value, hour, minute) }))
                }}
              />
              <select
                aria-label="Heure de fin (24h)"
                className={dateTimeSelectClass}
                value={splitDatetimeLocal(form.ends_at).hour}
                onChange={(ev) => {
                  const { date, minute } = splitDatetimeLocal(form.ends_at)
                  setForm((f) => ({ ...f, ends_at: combineDatetimeLocal(date, ev.target.value, minute) }))
                }}
              >
                {HOURS_24.map((h) => (
                  <option key={h} value={h}>
                    {h}h
                  </option>
                ))}
              </select>
              <select
                aria-label="Minute de fin"
                className={dateTimeSelectClass}
                value={splitDatetimeLocal(form.ends_at).minute}
                onChange={(ev) => {
                  const { date, hour } = splitDatetimeLocal(form.ends_at)
                  setForm((f) => ({ ...f, ends_at: combineDatetimeLocal(date, hour, ev.target.value) }))
                }}
              >
                {MINUTES_ALL.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {formatDatetimeLocalReadable(form.ends_at) && (
              <p className="mt-1 text-[11px] text-moon-200/40">→ {formatDatetimeLocalReadable(form.ends_at)}</p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <Label>Aperçu (optionnel)</Label>
            {form.preview_starts_at && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, preview_starts_at: '' }))}
                className="text-[11px] text-moon-300 underline underline-offset-2"
              >
                Retirer l’aperçu
              </button>
            )}
          </div>
          <p className="mb-1.5 text-[11px] text-moon-200/40">
            Rend la bannière visible avant le début officiel, pour teaser l’événement — le bonus de points, lui, ne
            s’active toujours qu’à partir de « Début » ci-dessus.
          </p>
          <div className="flex gap-1.5">
            <Input
              type="date"
              className="flex-1"
              value={splitDatetimeLocal(form.preview_starts_at).date}
              onChange={(ev) => {
                const { hour, minute } = splitDatetimeLocal(form.preview_starts_at)
                setForm((f) => ({ ...f, preview_starts_at: combineDatetimeLocal(ev.target.value, hour, minute) }))
              }}
            />
            <select
              aria-label="Heure de l’aperçu (24h)"
              className={dateTimeSelectClass}
              value={splitDatetimeLocal(form.preview_starts_at).hour}
              onChange={(ev) => {
                const { date, minute } = splitDatetimeLocal(form.preview_starts_at)
                setForm((f) => ({ ...f, preview_starts_at: combineDatetimeLocal(date, ev.target.value, minute) }))
              }}
            >
              {HOURS_24.map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
            <select
              aria-label="Minute de l’aperçu"
              className={dateTimeSelectClass}
              value={splitDatetimeLocal(form.preview_starts_at).minute}
              onChange={(ev) => {
                const { date, hour } = splitDatetimeLocal(form.preview_starts_at)
                setForm((f) => ({ ...f, preview_starts_at: combineDatetimeLocal(date, hour, ev.target.value) }))
              }}
            >
              {MINUTES_ALL.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          {formatDatetimeLocalReadable(form.preview_starts_at) && (
            <p className="mt-1 text-[11px] text-moon-200/40">→ {formatDatetimeLocalReadable(form.preview_starts_at)}</p>
          )}
        </div>

        <div>
          <Label>Bonus</Label>
          <Segmented
            tabs={(['none', 'flat', 'multiplier'] as EventBonusType[]).map((id) => ({ id, label: BONUS_TYPE_LABELS[id] }))}
            active={form.bonus_type}
            onChange={(id) => setForm((f) => ({ ...f, bonus_type: id }))}
          />
        </div>
        {form.bonus_type !== 'none' && (
          <div>
            <Label>{form.bonus_type === 'flat' ? 'Points bonus par victoire' : 'Multiplicateur (ex. 2 = points doublés)'}</Label>
            <Input
              type="number"
              step={form.bonus_type === 'flat' ? 1 : 0.1}
              min={0}
              value={form.bonus_value}
              onChange={(ev) => setForm((f) => ({ ...f, bonus_value: ev.target.value }))}
            />
          </div>
        )}

        <div>
          <Label>Couleur de la bannière</Label>
          <div className="flex gap-2">
            {(['gold', 'blood', 'emerald', 'violet'] as EventBannerColor[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, banner_color: c }))}
                className={`h-8 w-8 rounded-full ${BANNER_COLOR_SWATCHES[c]} ${
                  form.banner_color === c ? 'ring-2 ring-moon-200 ring-offset-2 ring-offset-night-900' : 'opacity-60'
                }`}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div>
          <Label>Texte de la bannière — Français</Label>
          <textarea
            rows={2}
            value={form.banner_text_fr}
            onChange={(ev) => setForm((f) => ({ ...f, banner_text_fr: ev.target.value }))}
            placeholder="Ex. 🎃 Week-end Halloween : points doublés sur toutes les victoires !"
            className={textareaClass}
          />
        </div>
        <div>
          <Label>Texte de la bannière — English</Label>
          <textarea
            rows={2}
            value={form.banner_text_en}
            onChange={(ev) => setForm((f) => ({ ...f, banner_text_en: ev.target.value }))}
            placeholder="Ex. 🎃 Halloween weekend: double points on every win!"
            className={textareaClass}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-moon-200/80">
          <input
            type="checkbox"
            checked={form.is_enabled}
            onChange={(ev) => setForm((f) => ({ ...f, is_enabled: ev.target.checked }))}
            className="h-4 w-4 rounded border-night-600/70 bg-night-900/50 accent-blood-600"
          />
          Activé (visible dès que la période commence)
        </label>

        <ErrorText>{error}</ErrorText>

        <div className="mt-2 flex gap-3">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {event ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </SideDrawer>
  )
}

/** Les deux images de bannière (FR et EN), l'une sous l'autre — une image
 * unique ne suffisait plus dès qu'elle contient un titre DESSINÉ dedans (ex.
 * "LE WEEKEND DES ROIS"), donc forcément lisible dans une seule langue à la
 * fois (voir migration 0076). L'image EN est optionnelle : tant qu'elle
 * n'est pas importée, EventBanner.tsx retombe sur l'image FR pour les
 * joueurs anglophones aussi — mieux qu'une bannière sans image du tout. */
function EventBannerImages({ event, onUploaded }: { event: GameEvent; onUploaded: () => void }) {
  return (
    <div className="flex flex-col gap-2 border-t border-night-600/50 pt-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <EventBannerImageUpload event={event} lang="fr" label="Image FR" onUploaded={onUploaded} />
        <EventBannerImageUpload event={event} lang="en" label="Image EN (optionnel, sinon reprend l’image FR)" onUploaded={onUploaded} />
      </div>
      {/* Format attendu par l'affichage réel (voir EventBanner.tsx : le
          bandeau est toujours découpé en ratio 3:1 via aspect-[3/1] +
          object-cover, quelle que soit la taille de l'image importée) —
          précisé ici pour éviter un import au hasard qui recadrerait mal un
          visuel important sur les bords gauche/droite. */}
      <p className="text-[10px] leading-snug text-moon-200/40">
        Format recommandé : ratio 3:1 (ex. 1500 × 500 px), JPG ou PNG. L’image est automatiquement recadrée à ce
        ratio et centrée — gardez l’essentiel du visuel au centre, les bords gauche/droite peuvent être coupés.
      </p>
    </div>
  )
}

/** Upload direct dans le bucket "event-banners" (nommé "{id}-{lang}.jpg"
 * pour distinguer les deux versions, même principe que RoleImagesSection),
 * puis admin_set_event_banner_image associe le chemin à la bonne colonne
 * (banner_image_path ou banner_image_path_en selon `lang`). Séparé du
 * formulaire principal car il n'a de sens qu'une fois l'événement créé (a
 * besoin de son id pour le nom du fichier). */
function EventBannerImageUpload({
  event,
  lang,
  label,
  onUploaded,
}: {
  event: GameEvent
  lang: 'fr' | 'en'
  label: string
  onUploaded: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const path = lang === 'fr' ? event.banner_image_path : event.banner_image_path_en
  const currentUrl = path ? supabase.storage.from('event-banners').getPublicUrl(path).data.publicUrl : null

  async function handleUpload(file: File) {
    setBusy(true)
    setError(null)
    // Même optimisation que les cartes de rôle (voir RoleImagesSection,
    // imageCompress.ts) : la bannière s'affiche au plus large que le
    // tableau de bord (max-w-3xl, ~768px) sur un ratio 3/1 — 1600×533
    // couvre confortablement le retina sans faire télécharger une photo brute.
    let toUpload: Blob = file
    try {
      toUpload = await compressImageForUpload(file, { maxWidth: 1600, maxHeight: 533 })
    } catch {
      // ignore, on envoie l'original
    }
    const path = `${event.id}-${lang}.jpg`
    const { error: uploadError } = await supabase.storage.from('event-banners').upload(path, toUpload, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '300',
    })
    if (uploadError) {
      setBusy(false)
      setError(uploadError.message)
      return
    }
    const { error: rpcError } = await supabase.rpc('admin_set_event_banner_image', { p_id: event.id, p_path: path, p_lang: lang })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onUploaded()
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-wide text-moon-200/40">{label}</p>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          <img src={currentUrl} alt="" className="h-12 w-24 rounded-lg border border-night-600/60 object-cover" />
        ) : (
          <span className="flex h-12 w-24 items-center justify-center rounded-lg border border-dashed border-night-600/60 text-[10px] text-moon-200/30">
            Aucune image
          </span>
        )}
        <label className="cursor-pointer rounded-lg border border-night-600/70 bg-night-800/50 px-3 py-1.5 text-[11px] font-semibold text-moon-200/80 transition-colors hover:border-moon-400/40">
          {busy ? '...' : currentUrl ? '📤 Changer' : '📤 Ajouter'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(ev) => {
              const file = ev.target.files?.[0]
              if (file) handleUpload(file)
              ev.target.value = ''
            }}
          />
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Catalogue des quêtes quotidiennes (voir QuestsCard.tsx côté joueur,
// migration 0112) — même patron que EventsTab/EventFormDrawer juste
// au-dessus : upsert unique (p_id null = création), toggle Activer/
// Désactiver en un clic, suppression définitive.
//
// `condition_key` reste un choix parmi un ensemble FERMÉ de 5 valeurs (voir
// le commentaire en tête de migration 0112) : chacune correspond à un bloc
// de code précis dans sync_daily_quests_for_game, l'admin ne peut pas en
// inventer une sixième depuis cet écran — seuls texte/objectif/récompense/
// activation sont librement modifiables.
// ----------------------------------------------------------------------------
type QuestConditionKey = 'games_played' | 'games_won' | 'survived' | 'won_as_wolf' | 'won_as_village'

const QUEST_CONDITION_LABELS: Record<QuestConditionKey, string> = {
  games_played: 'Nombre de parties jouées',
  games_won: 'Nombre de victoires',
  survived: 'Survivre jusqu’à la fin',
  won_as_wolf: 'Gagner en tant que Loup',
  won_as_village: 'Gagner en tant que Villageois',
}

interface QuestTemplate {
  id: string
  condition_key: QuestConditionKey
  label_fr: string
  label_en: string
  target: number
  reward_points: number
  active: boolean
  created_at: string
}

function QuestTemplatesTab() {
  const [templates, setTemplates] = useState<QuestTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<QuestTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<QuestTemplate | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_quest_templates')
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setTemplates((data ?? []) as QuestTemplate[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(qt: QuestTemplate) {
    setEditing(qt)
    setFormOpen(true)
  }

  async function toggleActive(qt: QuestTemplate) {
    setBusyId(qt.id)
    const { error: rpcError } = await supabase.rpc('admin_upsert_quest_template', {
      p_id: qt.id,
      p_condition_key: qt.condition_key,
      p_label_fr: qt.label_fr,
      p_label_en: qt.label_en,
      p_target: qt.target,
      p_reward_points: qt.reward_points,
      p_active: !qt.active,
    })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    const { error: rpcError } = await supabase.rpc('admin_delete_quest_template', { p_id: deleteTarget.id })
    setBusyId(null)
    setDeleteTarget(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-moon-200/60">
          {templates?.length ?? 0} quête(s) au catalogue — 3 tirées au hasard chaque jour parmi celles actives.
        </p>
        <Button className="px-3.5 py-2 text-xs" onClick={openCreate}>
          + Nouvelle quête
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      {templates === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {templates !== null && templates.length === 0 && <p className="text-sm text-moon-200/50">Aucune quête au catalogue.</p>}

      <div className="flex flex-col gap-2">
        {templates?.map((qt) => (
          <Card key={qt.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-moon-200">
                {qt.label_fr}
                {!qt.active && (
                  <span className="rounded-full bg-night-700/60 px-2 py-0.5 text-[10px] uppercase text-moon-200/50">
                    Désactivée
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-moon-200/50">
                {QUEST_CONDITION_LABELS[qt.condition_key]} · objectif {qt.target} · +{qt.reward_points} pts
              </p>
              <p className="mt-1 text-xs text-moon-200/40">🇫🇷 {qt.label_fr} · 🇬🇧 {qt.label_en}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busyId === qt.id} onClick={() => openEdit(qt)}>
                Modifier
              </Button>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busyId === qt.id} onClick={() => toggleActive(qt)}>
                {qt.active ? 'Désactiver' : 'Activer'}
              </Button>
              <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busyId === qt.id} onClick={() => setDeleteTarget(qt)}>
                Supprimer
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <QuestTemplateFormDrawer
        open={formOpen}
        template={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false)
          load()
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Supprimer « ${deleteTarget?.label_fr ?? ''} » ?`}
        message="Retirée du catalogue immédiatement. Un joueur qui l'a déjà en cours aujourd'hui la perd sans conséquence (une autre est réassignée le lendemain)."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

interface QuestTemplateFormState {
  condition_key: QuestConditionKey
  label_fr: string
  label_en: string
  target: string
  reward_points: string
  active: boolean
}

const EMPTY_QUEST_FORM: QuestTemplateFormState = {
  condition_key: 'games_played',
  label_fr: '',
  label_en: '',
  target: '1',
  reward_points: '5',
  active: true,
}

function QuestTemplateFormDrawer({
  open,
  template,
  onClose,
  onSaved,
}: {
  open: boolean
  template: QuestTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<QuestTemplateFormState>(EMPTY_QUEST_FORM)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (template) {
      setForm({
        condition_key: template.condition_key,
        label_fr: template.label_fr,
        label_en: template.label_en,
        target: String(template.target),
        reward_points: String(template.reward_points),
        active: template.active,
      })
    } else {
      setForm(EMPTY_QUEST_FORM)
    }
    setError(null)
  }, [open, template])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form.label_fr.trim() || !form.label_en.trim()) {
      setError('Texte requis (FR et EN).')
      return
    }
    const target = Number(form.target)
    const reward = Number(form.reward_points)
    if (!Number.isFinite(target) || target <= 0) {
      setError('Objectif invalide.')
      return
    }
    if (!Number.isFinite(reward) || reward < 0) {
      setError('Récompense invalide.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_upsert_quest_template', {
      p_id: template?.id ?? null,
      p_condition_key: form.condition_key,
      p_label_fr: form.label_fr,
      p_label_en: form.label_en,
      p_target: target,
      p_reward_points: reward,
      p_active: form.active,
    })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onSaved()
  }

  return (
    <SideDrawer open={open} onClose={onClose} title={template ? 'Modifier la quête' : 'Nouvelle quête'}>
      <form className="flex flex-col gap-4" onSubmit={save}>
        <div>
          <Label>Condition suivie</Label>
          <Segmented
            tabs={(Object.keys(QUEST_CONDITION_LABELS) as QuestConditionKey[]).map((id) => ({
              id,
              label: QUEST_CONDITION_LABELS[id],
            }))}
            active={form.condition_key}
            onChange={(id) => setForm((f) => ({ ...f, condition_key: id }))}
          />
        </div>

        <div>
          <Label>Texte affiché — Français</Label>
          <Input
            value={form.label_fr}
            onChange={(ev) => setForm((f) => ({ ...f, label_fr: ev.target.value }))}
            placeholder="Ex. Gagne une partie"
          />
        </div>
        <div>
          <Label>Texte affiché — English</Label>
          <Input
            value={form.label_en}
            onChange={(ev) => setForm((f) => ({ ...f, label_en: ev.target.value }))}
            placeholder="Ex. Win a game"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Objectif</Label>
            <Input
              type="number"
              min={1}
              value={form.target}
              onChange={(ev) => setForm((f) => ({ ...f, target: ev.target.value }))}
            />
          </div>
          <div>
            <Label>Récompense (points)</Label>
            <Input
              type="number"
              min={0}
              value={form.reward_points}
              onChange={(ev) => setForm((f) => ({ ...f, reward_points: ev.target.value }))}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-moon-200/80">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(ev) => setForm((f) => ({ ...f, active: ev.target.checked }))}
            className="h-4 w-4 rounded border-night-600/70 bg-night-900/50 accent-blood-600"
          />
          Active (peut être tirée au sort chaque jour)
        </label>

        <ErrorText>{error}</ErrorText>

        <div className="mt-2 flex gap-3">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {template ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </SideDrawer>
  )
}

// ----------------------------------------------------------------------------
// Messages reçus des joueurs (bouton "feedback" en jeu) — voir migration
// 0071. Remplace le suivi par email (Resend, best-effort, pas encore
// configuré côté Vercel) : les messages sont de toute façon déjà enregistrés
// en base par submit_feedback, cet onglet en est juste la lecture. Cliquer
// sur un message non lu le marque comme lu (même geste qu'une boîte mail
// classique), mise à jour optimiste locale plutôt que de recharger toute la
// page pour un simple changement de statut.
// ----------------------------------------------------------------------------
const MESSAGES_PAGE_SIZE = 20

function MessagesTab() {
  const [messages, setMessages] = useState<FeedbackMsg[] | null>(null)
  const [total, setTotal] = useState(0)
  const [unread, setUnread] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: number) => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_feedback', {
      p_limit: MESSAGES_PAGE_SIZE,
      p_offset: (p - 1) * MESSAGES_PAGE_SIZE,
    })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    const result = data as { messages: FeedbackMsg[]; total: number; unread: number }
    setMessages(result.messages)
    setTotal(result.total)
    setUnread(result.unread)
  }, [])

  useEffect(() => {
    load(page)
  }, [load, page])

  async function markRead(m: FeedbackMsg) {
    if (m.read_at) return
    // Optimiste : le message passe à "lu" à l'écran immédiatement, sans
    // attendre la réponse serveur — l'appel ne peut de toute façon
    // qu'accorder read_at, jamais échouer côté données pour un admin déjà
    // authentifié ici.
    setMessages((prev) => (prev ? prev.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)) : prev))
    setUnread((n) => Math.max(0, n - 1))
    await supabase.rpc('admin_mark_feedback_read', { p_id: m.id })
  }

  const totalPages = Math.max(1, Math.ceil(total / MESSAGES_PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-moon-200/60">
          {total} message(s){unread > 0 && <span className="text-blood-400"> · {unread} non lu(s)</span>}
        </p>
      </div>

      <ErrorText>{error}</ErrorText>

      {messages === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {messages !== null && messages.length === 0 && <p className="text-sm text-moon-200/50">Aucun message reçu pour l’instant.</p>}

      <div className="flex flex-col gap-2">
        {messages?.map((m) => {
          const isUnread = !m.read_at
          return (
            <Card
              key={m.id}
              className={`cursor-pointer p-4 transition-colors ${
                isUnread ? 'border-blood-600/60 bg-blood-900/10 hover:border-blood-500/70' : 'hover:border-moon-400/40'
              }`}
              onClick={() => markRead(m)}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-moon-200">
                  {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-blood-500" aria-hidden="true" />}
                  {m.username}
                </p>
                <p className="text-xs text-moon-200/40">{fmtDate(m.created_at)}</p>
              </div>
              <p className="mb-1 text-xs text-moon-200/40">{m.email}</p>
              <p className="whitespace-pre-wrap text-sm text-moon-200/85">{m.message}</p>
            </Card>
          )
        })}
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
    </div>
  )
}

// ----------------------------------------------------------------------------
// Onglet Notifications : composer/envoyer/programmer une notification push
// libre à tous les joueurs abonnés, avec aperçu avant envoi (voir migration
// 0129_notification_campaigns.sql, api/admin-send-campaign.ts et
// api/cron-send-campaigns.ts). Deux sous-écrans (Segmented) plutôt que tout
// empiler : composer une nouvelle campagne, ou consulter l'historique de
// celles déjà créées.
// ----------------------------------------------------------------------------

interface NotificationCampaign {
  id: string
  push_title: string
  push_body: string
  push_url: string
  status: 'scheduled' | 'sending' | 'sent' | 'canceled' | 'failed'
  scheduled_at: string
  sent_at: string | null
  created_at: string
  recipient_count: number
  sent_count: number
  removed_count: number
  error: string | null
}

const CAMPAIGN_STATUS_LABELS: Record<NotificationCampaign['status'], string> = {
  scheduled: 'Programmée',
  sending: 'Envoi en cours',
  sent: 'Envoyée',
  canceled: 'Annulée',
  failed: 'Échec',
}

const CAMPAIGN_STATUS_CLASSES: Record<NotificationCampaign['status'], string> = {
  scheduled: 'bg-moon-400/15 text-moon-300',
  sending: 'bg-moon-400/15 text-moon-300',
  sent: 'bg-emerald-700/20 text-emerald-400',
  canceled: 'bg-night-600 text-moon-200/60',
  failed: 'bg-blood-700/20 text-blood-400',
}

function NotificationsTab() {
  const [screen, setScreen] = useState<'compose' | 'history'>('compose')

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        tabs={[
          { id: 'compose', label: '✏️ Composer' },
          { id: 'history', label: '🕘 Historique' },
        ]}
        active={screen}
        onChange={setScreen}
      />
      {screen === 'compose' ? <ComposeCampaignPanel onSent={() => setScreen('history')} /> : <CampaignHistoryPanel />}
    </div>
  )
}

/** Formulaire de composition, avec aperçu qui se met à jour en direct à
 * chaque frappe — pas d'aller-retour serveur pour ça, l'aperçu n'est qu'un
 * rendu local du titre/texte déjà saisis, dans une bulle stylée comme une
 * vraie notification (voir sendPushToUser : title + body + icône fixe 🐺,
 * même format que toutes les autres notifications de l'app). */
function ComposeCampaignPanel({ onSent }: { onSent: () => void }) {
  const [pushTitle, setPushTitle] = useState('')
  const [pushBody, setPushBody] = useState('')
  const [pushUrl, setPushUrl] = useState('/dashboard')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduledAtLocal, setScheduledAtLocal] = useState('')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_get_push_subscriber_count').then(({ data }) => {
      if (typeof data === 'number') setRecipientCount(data)
    })
  }, [])

  const isScheduledInFuture = scheduleEnabled && scheduledAtLocal !== '' && new Date(scheduledAtLocal).getTime() > Date.now()
  const canSubmit = pushTitle.trim() !== '' && pushBody.trim() !== '' && (!scheduleEnabled || scheduledAtLocal !== '')

  async function submit() {
    setConfirmOpen(false)
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_create_notification_campaign', {
        p_push_title: pushTitle.trim(),
        p_push_body: pushBody.trim(),
        p_push_url: pushUrl.trim() || '/dashboard',
        p_scheduled_at: isScheduledInFuture ? new Date(scheduledAtLocal).toISOString() : null,
      })
      if (rpcError) throw new Error(rpcError.message)
      const campaign = data as { id: string }

      if (isScheduledInFuture) {
        setSuccess(`Notification programmée pour le ${fmtDate(new Date(scheduledAtLocal).toISOString())}.`)
      } else {
        const result = await sendNotificationCampaignNow(campaign.id)
        setSuccess(`Notification envoyée à ${result.sent} appareil(s)${result.removed > 0 ? ` (${result.removed} abonnement(s) expiré(s) retiré(s))` : ''}.`)
      }

      setPushTitle('')
      setPushBody('')
      setPushUrl('/dashboard')
      setScheduleEnabled(false)
      setScheduledAtLocal('')
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-4 p-4">
        <div>
          <Label>Titre de la notification</Label>
          <Input
            placeholder="🐺 Nouveau mode disponible !"
            value={pushTitle}
            onChange={(e) => setPushTitle(e.target.value)}
            maxLength={80}
          />
        </div>
        <div>
          <Label>Texte</Label>
          <textarea
            rows={3}
            placeholder="Le mode de test solo est arrivé, viens l'essayer..."
            value={pushBody}
            onChange={(e) => setPushBody(e.target.value)}
            maxLength={200}
            className="w-full rounded-xl border border-night-500 bg-night-800/80 px-4 py-3 text-sm text-moon-200 placeholder:text-moon-200/30 outline-none transition focus:border-moon-400/60 focus:ring-2 focus:ring-moon-400/20"
          />
        </div>
        <div>
          <Label>Lien au clic (optionnel)</Label>
          <Input placeholder="/dashboard" value={pushUrl} onChange={(e) => setPushUrl(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm text-moon-200/80">
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(e) => setScheduleEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-night-600/70 bg-night-900/50 accent-blood-600"
          />
          Programmer l’envoi plutôt que l’envoyer maintenant
        </label>
        {scheduleEnabled && (
          <div>
            <Label>Date et heure d’envoi</Label>
            <Input type="datetime-local" value={scheduledAtLocal} onChange={(e) => setScheduledAtLocal(e.target.value)} />
            <p className="mt-1.5 text-xs text-moon-200/40">
              L’envoi programmé est traité une fois par jour (limite du plan d’hébergement) — l’heure exacte n’est donc pas garantie
              à la minute près. Pour un envoi précis, décoche cette case et clique sur « Envoyer maintenant ».
            </p>
          </div>
        )}

        <p className="text-xs text-moon-200/50">
          {recipientCount === null ? 'Chargement du nombre de destinataires...' : `📣 ${recipientCount} destinataire(s) abonné(s) aux notifications.`}
        </p>

        <ErrorText>{error}</ErrorText>
        <SuccessText>{success}</SuccessText>

        <Button disabled={!canSubmit || busy} onClick={() => setConfirmOpen(true)}>
          {isScheduledInFuture ? 'Programmer l’envoi' : 'Envoyer maintenant'}
        </Button>
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-moon-200/50">Aperçu</p>
        <div className="flex items-start gap-3 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/90 to-night-900/95 p-4 shadow-card">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blood-600 text-lg">🐺</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-moon-200">{pushTitle.trim() || 'Titre de la notification'}</p>
            <p className="mt-0.5 text-xs text-moon-200/70">{pushBody.trim() || 'Le texte de la notification apparaîtra ici.'}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-moon-200/30">Loup Garou d’Afrique</p>
          </div>
        </div>
        <p className="text-xs text-moon-200/40">Rendu approximatif — l’apparence exacte dépend du système d’exploitation du joueur.</p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={isScheduledInFuture ? 'Programmer cette notification ?' : 'Envoyer cette notification maintenant ?'}
        message={
          isScheduledInFuture
            ? `Elle sera envoyée à ${recipientCount ?? '?'} destinataire(s) le ${scheduledAtLocal ? fmtDate(new Date(scheduledAtLocal).toISOString()) : ''}.`
            : `Elle sera envoyée immédiatement à ${recipientCount ?? '?'} destinataire(s). Action irréversible.`
        }
        confirmLabel={isScheduledInFuture ? 'Programmer' : 'Envoyer'}
        cancelLabel="Annuler"
        onConfirm={submit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

function CampaignHistoryPanel() {
  const [campaigns, setCampaigns] = useState<NotificationCampaign[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_notification_campaigns', { p_limit: 30 })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setCampaigns((data ?? []) as NotificationCampaign[])
  }, [])

  useEffect(() => {
    load()
    // Rafraîchit tant qu'une campagne programmée/en cours peut changer de
    // statut (cron, ou un autre onglet admin ouvert ailleurs) — même
    // fréquence que les autres listes du dashboard.
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  async function cancel(id: string) {
    setBusyId(id)
    const { error: rpcError } = await supabase.rpc('admin_cancel_notification_campaign', { p_campaign_id: id })
    setBusyId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    load()
  }

  return (
    <div className="flex flex-col gap-3">
      <ErrorText>{error}</ErrorText>
      {campaigns === null && <p className="text-sm text-moon-200/50">Chargement...</p>}
      {campaigns !== null && campaigns.length === 0 && (
        <p className="text-sm text-moon-200/50">Aucune notification envoyée ou programmée pour l’instant.</p>
      )}
      {campaigns?.map((c) => (
        <Card key={c.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CAMPAIGN_STATUS_CLASSES[c.status]}`}>
                {CAMPAIGN_STATUS_LABELS[c.status]}
              </span>
              <p className="text-sm font-semibold text-moon-200">{c.push_title}</p>
            </div>
            <p className="mb-1 text-xs text-moon-200/60">{c.push_body}</p>
            <p className="text-xs text-moon-200/40">
              {c.status === 'sent' && c.sent_at
                ? `Envoyée le ${fmtDate(c.sent_at)} · ${c.sent_count} reçue(s)${c.removed_count > 0 ? `, ${c.removed_count} abonnement(s) expiré(s) retiré(s)` : ''}`
                : c.status === 'scheduled'
                  ? `Programmée pour le ${fmtDate(c.scheduled_at)} · ${c.recipient_count} destinataire(s) prévu(s)`
                  : c.status === 'failed'
                    ? `Échec : ${c.error ?? 'raison inconnue'}`
                    : `Créée le ${fmtDate(c.created_at)}`}
            </p>
          </div>
          {c.status === 'scheduled' && (
            <Button variant="ghost" className="shrink-0 px-3 py-1.5 text-xs" disabled={busyId === c.id} onClick={() => cancel(c.id)}>
              Annuler
            </Button>
          )}
        </Card>
      ))}
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
