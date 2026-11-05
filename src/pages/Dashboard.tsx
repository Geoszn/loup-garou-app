import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cachedRpc } from '../lib/rpcCache'
import { homeSection } from '../lib/homeBootstrap'
import { notifyJoinRequest } from '../lib/pushSubscription'
import { Button, Card, ErrorText } from '../components/ui'
import { DailyLoginBanner } from '../components/DailyLoginBanner'
import { AnnouncementsModal } from '../components/AnnouncementsModal'
import { NotificationTimezoneSync } from '../components/NotificationTimezoneSync'
import { FriendsOnlineWidget, type FriendPerson } from '../components/FriendsOnlineWidget'
import { RankProgress } from '../components/RankProgress'
import { useMyAvatarConfig } from '../components/AvatarEditor'
import { useMyQuests } from '../hooks/useMyQuests'
import { ContinentPrompt } from '../components/ContinentPrompt'
import { NotificationOptInPrompt } from '../components/NotificationOptInPrompt'
import { PromoCarousel } from '../components/PromoCarousel'
import { useActiveEvents } from '../hooks/useActiveEvents'
import { useActiveBanners } from '../hooks/useActiveBanners'
import { useMySeason } from '../hooks/useMySeason'
import { accessibleTiers } from '../components/SeasonTrack'
import { useQuickPlay } from '../hooks/useQuickPlay'
import { LiveVillage } from '../components/LiveVillage'
import { GettingStartedCard, useIsNewPlayer } from '../components/GettingStartedCard'
import { MusicToggle } from '../components/MusicToggle'
import { TribeCard } from '../components/tribe/TribeCard'
import { AfterIdle } from '../components/Deferred'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from '../components/Avatar'

interface GameInvite {
  invite_id: string
  game_id: string
  code: string
  from_username: string
  from_avatar_icon: string
  from_avatar_config?: unknown
}

interface ActiveGame {
  code: string
  status: string
}

export default function Dashboard() {
  const { user, profile, isGuest } = useAuth()
  const myAvatar = useMyAvatarConfig()
  const { quests, claimableCount } = useMyQuests()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()
  // Message ponctuel passé via navigate(path, { state: { notice } }), par
  // exemple après avoir été retiré d'un salon/partie par l'hôte (voir
  // Lobby.tsx / GameRoom.tsx) ou après confirmation d'email (voir
  // VerifyEmail.tsx). Capturé une seule fois au montage : on ne veut pas
  // qu'il réapparaisse si l'utilisateur revient sur cette page par un autre
  // chemin plus tard dans la session. `tone` distingue un avertissement (rouge,
  // par défaut — comportement historique de ce bandeau) d'une bonne nouvelle
  // (vert) : les appelants existants ne passent pas `tone`, donc rien ne
  // change pour eux.
  const noticeState = location.state as { notice?: string; tone?: 'warning' | 'success' } | null
  const [notice] = useState<string | null>(noticeState?.notice ?? null)
  const [noticeTone] = useState<'warning' | 'success'>(noticeState?.tone ?? 'warning')
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invites, setInvites] = useState<GameInvite[]>([])
  const [friends, setFriends] = useState<FriendPerson[]>([])
  const [joiningInvite, setJoiningInvite] = useState<string | null>(null)

  // Partie en cours à laquelle l'utilisateur participe encore (voir
  // get_my_active_game, migration 0037) — pour le rappel "Reprendre" quand
  // il est revenu ici via le bouton 🏠 sans quitter la partie.
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null)

  useEffect(() => {
    if (!user) return
    homeSection<ActiveGame>('active_game', async () => {
      const { data, error: rpcError } = await supabase.rpc('get_my_active_game')
      return rpcError ? null : ((data as ActiveGame | null) ?? null)
    }).then((data) => setActiveGame(data ?? null))
  }, [user])

  // Interrupteur admin "nouvelles parties" (voir AdminDashboard.tsx / migration
  // 0048) : get_app_status() est accessible à tout le monde (anon compris),
  // juste ce booléen — pas besoin d'être admin pour savoir que la création
  // de partie est temporairement coupée.
  const [newGamesEnabled, setNewGamesEnabled] = useState(true)
  // « Serveur complet » (migration 0256/0258) : plafond de joueurs en ligne atteint, les nouvelles parties sont refusées.
  const [serverFull, setServerFull] = useState(false)
  useEffect(() => {
    homeSection<{ new_games_enabled: boolean; server_full?: boolean }>('app_status', async () => {
      const { data, error: rpcError } = await supabase.rpc('get_app_status')
      return rpcError ? null : (data as { new_games_enabled: boolean; server_full?: boolean } | null)
    }).then((data) => {
      if (data) {
        setNewGamesEnabled(!!data.new_games_enabled)
        setServerFull(!!data.server_full)
      }
    })
  }, [])

  // Bannière(s) d'événement en cours (voir migration 0067) — même hook que
  // Landing.tsx, pour que « Mon espace » affiche aussi les événements actifs
  // (demandé explicitement : les joueurs déjà connectés ne passent pas
  // forcément par la page d'accueil publique).
  const { events, refresh: refreshEvents } = useActiveEvents()
  // Pas de callback onExpire ici : contrairement à un événement (compte à
  // rebours client via EventBanner), une bannière n'a pas de minuteur local
  // qui détecterait sa propre fin — le polling de 30s de useActiveBanners
  // suffit à la faire disparaître.
  const { banners } = useActiveBanners()
  const { season } = useMySeason()
  // Tuile « Saison » : palier atteint et récompenses prêtes, sur les pistes accessibles (gratuite, + premium avec le pass).
  const seasonTile = season
    ? (() => {
        const tiers = accessibleTiers(season)
        const reached = new Set(tiers.filter((tier) => tier.xp_required <= season.xp).map((tier) => tier.tier_number)).size
        return { reached, claimable: tiers.filter((tier) => !tier.claimed && tier.xp_required <= season.xp).length }
      })()
    : null
  // Nouveau joueur : « Bien démarrer » est sa seule zone d'action (son bouton fait déjà « Jouer maintenant »).
  const newPlayer = useIsNewPlayer()
  const quick = useQuickPlay(profile?.username ?? t('common.playerFallback'), isGuest)

  function resumeActiveGame() {
    if (!activeGame) return
    navigate(activeGame.status === 'lobby' ? `/partie/${activeGame.code}/lobby` : `/partie/${activeGame.code}`)
  }

  async function loadSocial(force = false) {
    type Social = { game_invites?: GameInvite[]; friends?: FriendPerson[] }
    const data = force
      ? (await cachedRpc<Social>('get_my_social', undefined, { force: true })).data
      : await homeSection<Social>('social', async () => (await cachedRpc<Social>('get_my_social')).data)
    if (!data) return
    setInvites(data.game_invites ?? [])
    setFriends(data.friends ?? [])
  }

  useEffect(() => {
    if (!user) return
    loadSocial()

    // Réveille le dashboard dès qu'une invitation arrive ou qu'une demande
    // d'ami est reçue, sans attendre un rechargement manuel de la page.
    const channel = supabase
      .channel(`social-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_invites', filter: `to_user_id=eq.${user.id}` },
        () => void loadSocial(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `addressee_id=eq.${user.id}` },
        () => void loadSocial(true)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  async function acceptInvite(invite: GameInvite) {
    setError(null)
    setJoiningInvite(invite.invite_id)
    const { data, error: rpcError } = await supabase.rpc('join_game', {
      p_code: invite.code,
      p_display_name: profile?.username ?? t('common.playerFallback'),
    })
    setJoiningInvite(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    // Cas rare mais possible : la partie a démarré entre l'envoi de
    // l'invitation et son acceptation (voir join_game, migration 0038).
    if (data.status === 'pending') {
      void notifyJoinRequest(data.game_id)
      navigate(`/attente/${data.game_id}`, { state: { code: data.code } })
      return
    }
    navigate(`/partie/${data.code}/lobby`)
  }

  async function dismissInvite(inviteId: string) {
    setInvites((prev) => prev.filter((i) => i.invite_id !== inviteId))
    await supabase.rpc('dismiss_game_invite', { p_invite_id: inviteId })
  }

  return (
    <div className="min-h-screen px-4 pt-6">
      {/* Comptes créés avant la migration 0057 (continent) : pop-up
          non bloquante, tant que le continent n'est pas choisi. */}
      <ContinentPrompt />
      {/* Attend que le continent soit déjà renseigné avant de s'afficher
          (voir le commentaire du composant) — jamais superposée à celle du
          dessus au même login. */}
      <NotificationOptInPrompt />
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex items-center justify-between gap-2">
          {/* Logo cliquable vers la page d'accueil publique. */}
          <Link
            to="/"
            title={t('common.backHome')}
            className="flex min-w-0 shrink items-center gap-1.5 font-display text-sm text-moon-300 transition-opacity hover:opacity-80 sm:gap-2 sm:text-lg"
          >
            <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8" />
            <span className="truncate">Loup Garou d'Afrique</span>
          </Link>
          <MusicToggle />
        </header>

        {/* Accueil en 3 zones (refonte 2026-11) : 1. ce qui ne peut pas attendre, 2. jouer, 3. ma tribu et ma progression.
            Une seule information urgente à la fois, un seul gros bouton, le reste en tuiles libellées. */}

        {/* ZONE 1 — « Maintenant » : messages ponctuels, partie en cours, invitations. Rien ne s'affiche s'il n'y a rien. */}
        {notice && !noticeDismissed && (
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm text-moon-200/90 ${
              noticeTone === 'success' ? 'border-emerald-700/50 bg-emerald-700/10' : 'border-blood-700/40 bg-blood-700/10'
            }`}
          >
            <span>{noticeTone === 'success' ? '✅' : '🚫'} {notice}</span>
            <button type="button" onClick={() => setNoticeDismissed(true)} className="shrink-0 text-moon-200/40 transition-colors hover:text-moon-200">
              ✕
            </button>
          </div>
        )}

        {activeGame ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-moon-400/50 bg-moon-400/10 px-4 py-3">
            <p className="min-w-0 text-sm text-moon-200/90">
              <span className="block text-[11px] uppercase tracking-wide text-moon-300">🎮 {t('dashboard.activeGame')}</span>
              {t('home.now.resume', { code: activeGame.code })}
            </p>
            <Button className="shrink-0 px-4 py-2 text-sm" onClick={resumeActiveGame}>
              {t('dashboard.resume')}
            </Button>
          </div>
        ) : (
          invites.length > 0 && (
            <Card className="flex flex-col gap-3 py-4">
              <p className="flex flex-wrap items-center gap-1 text-sm text-moon-200/90">
                <Avatar config={invites[0].from_avatar_config} icon={invites[0].from_avatar_icon} name={invites[0].from_username} className="h-7 w-7" />
                <strong className="text-moon-200">{invites[0].from_username}</strong>
                {t('dashboard.inviteFrom')} ({invites[0].code}).
              </p>
              <div className="flex items-center gap-2">
                {invites.length > 1 && <span className="mr-auto text-xs text-moon-200/50">{t('home.now.moreInvites', { n: invites.length - 1 })}</span>}
                <Button variant="ghost" className="ml-auto px-3 py-1.5 text-xs" onClick={() => dismissInvite(invites[0].invite_id)}>
                  {t('dashboard.inviteDismiss')}
                </Button>
                <Button className="px-3 py-1.5 text-xs" disabled={joiningInvite === invites[0].invite_id} onClick={() => acceptInvite(invites[0])}>
                  {joiningInvite === invites[0].invite_id ? t('dashboard.inviteJoining') : t('dashboard.inviteJoin')}
                </Button>
              </div>
            </Card>
          )
        )}

        {!newGamesEnabled && (
          <div className="rounded-xl border border-blood-700/40 bg-blood-700/10 px-4 py-2.5 text-sm text-moon-200/90">
            ⏸ La création et l'entrée dans de nouvelles parties sont temporairement désactivées. Les parties déjà en
            cours continuent normalement.
          </div>
        )}
        {serverFull && newGamesEnabled && (
          <div className="rounded-xl border border-moon-400/40 bg-moon-400/10 px-4 py-2.5 text-sm text-moon-200/90">⏳ {t('server.full')}</div>
        )}
        <ErrorText>{error ?? quick.error}</ErrorText>

        {/* Nouveau joueur sans vraie partie : par où commencer (partie d'entraînement, avatar). */}
        <GettingStartedCard />

        {/* ZONE 2 — Jouer : un gros bouton qui place directement dans une partie publique, deux raccourcis libellés. */}
        {!activeGame && newPlayer === false && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void quick.quickPlay()}
              disabled={quick.busy || !newGamesEnabled || serverFull}
              className="flex w-full flex-col items-center gap-0.5 rounded-2xl bg-gradient-to-b from-blood-500 to-blood-700 px-5 py-4 text-[#fdf6e3] shadow-blood-btn transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <span className="font-display text-xl">🐺 {quick.busy ? t('home.play.searching') : t('home.play.now')}</span>
              <span className="text-xs text-[#fdf6e3]/75">{t('home.play.nowSub')}</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/jouer?ouvrir=creer"
                className="rounded-xl border border-night-600/70 bg-night-800/60 px-3 py-2.5 text-center text-sm font-semibold text-moon-200 transition-colors hover:border-moon-400/40"
              >
                🌕 {t('home.play.create')}
              </Link>
              <Link
                to="/jouer?ouvrir=code"
                className="rounded-xl border border-night-600/70 bg-night-800/60 px-3 py-2.5 text-center text-sm font-semibold text-moon-200 transition-colors hover:border-moon-400/40"
              >
                🔑 {t('home.play.code')}
              </Link>
            </div>
          </div>
        )}

        {/* « Le village veille » : la preuve que le jeu est vivant, et les salons à rejoindre d'un toucher. */}
        <LiveVillage />

        {/* ZONE 3 — Ma tribu (gardée en bonne place : c'est elle qui fait revenir les joueurs), puis ma progression. */}
        <AfterIdle delay={1200}>
          <TribeCard />
        </AfterIdle>

        {newPlayer === false && (
        <div className="flex flex-col gap-3 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 p-4 shadow-card">
          <div className="flex items-center gap-3">
            <Avatar config={myAvatar.config} icon={profile?.avatar_icon} name={profile?.username} className="h-11 w-11 ring-2 ring-moon-400/50" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base text-moon-200">{profile?.username}</p>
              <p className="truncate text-[11px] text-moon-200/50">
                {t('home.streak.wins', { n: profile?.current_streak ?? 0 })} · {t('home.streak.days', { n: profile?.login_streak ?? 0 })}
              </p>
            </div>
          </div>
          <RankProgress points={profile?.rank_points ?? 0} />
          <div className="grid grid-cols-3 gap-2">
            <ProgressTile to="/recompenses?tab=store" label={t('home.tile.coins')} value={String(profile?.loup_coins ?? 0)} />
            <ProgressTile
              to="/recompenses"
              label={t('home.tile.quests')}
              value={quests ? t('home.tile.questsValue', { done: quests.filter((q) => q.progress >= q.target).length, total: quests.length }) : '—'}
              badge={claimableCount > 0 ? t('home.tile.claim', { count: claimableCount }) : undefined}
            />
            {seasonTile ? (
              <ProgressTile
                to="/recompenses?tab=season"
                label={t('home.tile.season')}
                value={t('home.tile.seasonValue', { n: seasonTile.reached })}
                badge={seasonTile.claimable > 0 ? t('home.tile.claim', { count: seasonTile.claimable }) : undefined}
              />
            ) : (
              <ProgressTile to="/stats" label={t('home.tile.rank')} value={t('home.tile.rankValue', { points: profile?.rank_points ?? 0 })} />
            )}
          </div>
        </div>
        )}

        {/* Événements et bannières : un seul emplacement, qui défile. */}
        <PromoCarousel events={events} banners={banners} onExpire={refreshEvents} />

        <DailyLoginBanner hasActiveEvent={events.length > 0} />
        <AfterIdle delay={1500}>
          <AnnouncementsModal />
        </AfterIdle>
        <AfterIdle delay={4000}>
          <NotificationTimezoneSync />
        </AfterIdle>

        <FriendsOnlineWidget friends={friends} />
      </div>
    </div>
  )
}

/** Tuile de la carte « Ma progression » : un libellé, une valeur, et au besoin une pastille « à réclamer ». */
function ProgressTile({ to, label, value, badge }: { to: string; label: string; value: string; badge?: string }) {
  return (
    <Link to={to} className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl border border-night-600/60 bg-night-900/50 px-2 py-2.5 text-center transition-colors hover:border-moon-400/40">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-moon-200/50">{label}</span>
      <span className="truncate text-sm font-semibold text-moon-200">{value}</span>
      {badge && <span className="mt-0.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">{badge}</span>}
    </Link>
  )
}
