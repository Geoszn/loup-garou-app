import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { notifyJoinRequest } from '../lib/pushSubscription'
import { Button, Card, ErrorText, Modal, SectionDivider } from '../components/ui'
import { RankBadge } from '../components/RankBadge'
import { DailyLoginBanner } from '../components/DailyLoginBanner'
import { AnnouncementsModal } from '../components/AnnouncementsModal'
import { NotificationTimezoneSync } from '../components/NotificationTimezoneSync'
import { FriendsOnlineWidget, type FriendPerson } from '../components/FriendsOnlineWidget'
import { RankProgress } from '../components/RankProgress'
import { useMyAvatarConfig } from '../components/AvatarEditor'
import { useMyQuests } from '../hooks/useMyQuests'
import { DashboardLeaderboard } from '../components/DashboardLeaderboard'
import { FeedbackButton } from '../components/FeedbackButton'
import { ContinentPrompt } from '../components/ContinentPrompt'
import { NotificationOptInPrompt } from '../components/NotificationOptInPrompt'
import { QuoteCarousel } from '../components/QuoteCarousel'
import { EventBanner } from '../components/EventBanner'
import { useNarrator } from '../hooks/useNarrator'
import { useActiveEvents } from '../hooks/useActiveEvents'
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

type NarratorTestState = 'idle' | 'testing' | 'success' | 'failed'

export default function Dashboard() {
  const { user, profile } = useAuth()
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
    supabase.rpc('get_my_active_game').then(({ data, error: rpcError }) => {
      if (!rpcError) setActiveGame((data as ActiveGame | null) ?? null)
    })
  }, [user])

  // Interrupteur admin "nouvelles parties" (voir AdminDashboard.tsx / migration
  // 0048) : get_app_status() est accessible à tout le monde (anon compris),
  // juste ce booléen — pas besoin d'être admin pour savoir que la création
  // de partie est temporairement coupée.
  const [newGamesEnabled, setNewGamesEnabled] = useState(true)
  useEffect(() => {
    supabase.rpc('get_app_status').then(({ data, error: rpcError }) => {
      if (!rpcError && data) setNewGamesEnabled(!!(data as { new_games_enabled: boolean }).new_games_enabled)
    })
  }, [])

  // Bannière(s) d'événement en cours (voir migration 0067) — même hook que
  // Landing.tsx, pour que « Mon espace » affiche aussi les événements actifs
  // (demandé explicitement : les joueurs déjà connectés ne passent pas
  // forcément par la page d'accueil publique).
  const { events, refresh: refreshEvents } = useActiveEvents()

  function resumeActiveGame() {
    if (!activeGame) return
    navigate(activeGame.status === 'lobby' ? `/partie/${activeGame.code}/lobby` : `/partie/${activeGame.code}`)
  }

  // --- Créer une partie -----------------------------------------------------
  const narrator = useNarrator(null)
  const [narratorTest, setNarratorTest] = useState<NarratorTestState>('idle')
  const [narratorTestError, setNarratorTestError] = useState<string | null>(null)
  const narratorCancelledRef = useRef(false)

  async function runNarratorTest() {
    narratorCancelledRef.current = false
    setNarratorTest('testing')
    setNarratorTestError(null)
    try {
      await narrator.testVoice()
      if (narratorCancelledRef.current) return
      setNarratorTest('success')
    } catch (err) {
      if (narratorCancelledRef.current) return
      setNarratorTestError(err instanceof Error ? err.message : t('dashboard.narrator.fallbackError'))
      setNarratorTest('failed')
    }
  }

  function cancelNarratorTest() {
    narratorCancelledRef.current = true
    narrator.stop()
    setNarratorTest('idle')
  }

  function closeNarratorTest() {
    setNarratorTest('idle')
  }

  async function loadSocial() {
    const { data, error: rpcError } = await supabase.rpc('get_my_social')
    if (rpcError || !data) return
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
        loadSocial
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `addressee_id=eq.${user.id}` },
        loadSocial
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
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex items-center justify-between gap-2">
          {/* Logo cliquable vers la page d'accueil publique — jusqu'ici rien
              sur ce tableau de bord ne permettait d'en sortir autrement
              qu'en fermant l'onglet. Une seule ligne, taille réduite sur
              mobile : le retour à la ligne forcé faisait passer les badges
              de droite sur une deuxième ligne collée à gauche, un rendu qui
              ressemblait à un bug plus qu'à une mise en page voulue. */}
          <Link
            to="/"
            title={t('common.backHome')}
            className="flex min-w-0 shrink items-center gap-1.5 font-display text-sm text-moon-300 transition-opacity hover:opacity-80 sm:gap-2 sm:text-lg"
          >
            <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8" />
            <span className="truncate">Loup Garou d'Afrique</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {profile && <RankBadge points={profile.rank_points} streak={profile.current_streak} />}
          </div>
        </header>

        {/* Deux actions principales, côte à côte, réduites à l'essentiel :
            chaque bouton ouvre une pop-up qui pose UNE question à la fois
            (privé/public, recherche/code) plutôt que d'étaler tous les choix
            et explications directement sur cette page. Placées juste sous le
            header, AVANT les bannières conditionnelles ci-dessous
            (partie en cours, événement, notice, partie désactivée,
            invitations) : ce sont les deux actions les plus utilisées de
            toute l'app, elles ne doivent jamais dépendre du nombre de
            bannières actives ce jour-là pour rester atteignables sans
            scroll. Le rappel "partie en cours" juste après suit désormais le
            même principe (voir son commentaire dédié) — seuls la bannière
            d'événement, la notice ponctuelle et le reste peuvent encore
            s'empiler en dessous. */}
        {/* Style "verre dépoli" (fond très translucide + backdrop-blur, fine
            bordure quasi-blanche) plutôt que le dégradé opaque du Card
            générique — direction esthétique demandée par l'admin
            ("liquid glass" à la Apple), amorcée sur EventBanner.tsx et
            étendue ici progressivement. Volontairement PAS reporté sur le
            composant Card partagé lui-même (ui.tsx) : il est réutilisé ~45
            fois dans l'appli, souvent plusieurs cartes empilées en même
            temps pendant une partie, et backdrop-blur coûte une couche de
            composition GPU par élément sur WKWebView iOS — un coût déjà
            identifié et évité ailleurs (voir le commentaire de Card). Ces
            deux boutons sont en revanche uniques sur cette page, sans
            empilement ni répétition : aucun risque de fluidité comparable. */}
        <div className="flex flex-col gap-3 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 p-4 shadow-card">
          <div className="flex items-center gap-3">
            <Avatar config={myAvatar.config} icon={profile?.avatar_icon} name={profile?.username} className="h-14 w-14 ring-2 ring-moon-400/50" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-moon-200/50">{t('home.welcomeBack')}</p>
              <p className="truncate font-display text-lg text-moon-200">{profile?.username}</p>
            </div>
            <div className="text-right text-xs text-moon-200/60">
              <p>🔥 {profile?.current_streak ?? 0}</p>
              <p>📅 {profile?.login_streak ?? 0} {t('dailyStreak.days')}</p>
            </div>
          </div>
          <RankProgress points={profile?.rank_points ?? 0} />
        </div>

        {activeGame && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-moon-400/40 bg-moon-400/5 px-4 py-3">
            <p className="text-sm text-moon-200/90">
              🎮 {t('dashboard.activeGame')} — <strong className="text-moon-200">{activeGame.code}</strong>
            </p>
            <Button className="px-3.5 py-1.5 text-xs" onClick={resumeActiveGame}>
              {t('dashboard.resume')}
            </Button>
          </div>
        )}

        {events.length > 0 && (
          <div>
            {events.map((e) => (
              <EventBanner key={e.id} event={e} onExpire={refreshEvents} />
            ))}
          </div>
        )}

        <DailyLoginBanner hasActiveEvent={events.length > 0} />
        <AnnouncementsModal />
        <NotificationTimezoneSync />

        {notice && !noticeDismissed && (
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm text-moon-200/90 ${
              noticeTone === 'success'
                ? 'border-emerald-700/50 bg-emerald-700/10'
                : 'border-blood-700/40 bg-blood-700/10'
            }`}
          >
            <span>{noticeTone === 'success' ? '✅' : '🚫'} {notice}</span>
            <button
              type="button"
              onClick={() => setNoticeDismissed(true)}
              className="shrink-0 text-moon-200/40 transition-colors hover:text-moon-200"
            >
              ✕
            </button>
          </div>
        )}

        {!newGamesEnabled && (
          <div className="rounded-xl border border-blood-700/40 bg-blood-700/10 px-4 py-2.5 text-sm text-moon-200/90">
            ⏸ La création et l'entrée dans de nouvelles parties sont temporairement désactivées. Les parties déjà en
            cours continuent normalement.
          </div>
        )}

        <ErrorText>{error}</ErrorText>

        {invites.length > 0 && (
          <div className="flex flex-col gap-3">
            {invites.map((invite) => (
              <Card key={invite.invite_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <p className="flex flex-wrap items-center gap-1 text-sm text-moon-200/90">
                  <Avatar config={invite.from_avatar_config} icon={invite.from_avatar_icon} name={invite.from_username} className="h-7 w-7" />
                  <strong className="text-moon-200">{invite.from_username}</strong>
                  {t('dashboard.inviteFrom')} ({invite.code}).
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => dismissInvite(invite.invite_id)}>
                    {t('dashboard.inviteDismiss')}
                  </Button>
                  <Button
                    className="px-3 py-1.5 text-xs"
                    disabled={joiningInvite === invite.invite_id}
                    onClick={() => acceptInvite(invite)}
                  >
                    {joiningInvite === invite.invite_id ? t('dashboard.inviteJoining') : t('dashboard.inviteJoin')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {quests && quests.length > 0 && (
          <Link
            to="/recompenses"
            className="flex items-center gap-3 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 px-4 py-3 shadow-card transition-colors hover:border-moon-400/40"
          >
            <span className="text-2xl" aria-hidden="true">📜</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-moon-200">
                {t('home.quests', { done: quests.filter((q) => q.progress >= q.target).length, total: quests.length })}
              </span>
              <span className="mt-1.5 flex gap-1">
                {quests.map((q) => (
                  <span key={q.template_id} className={`h-1.5 flex-1 rounded-full ${q.progress >= q.target ? 'bg-moon-300' : 'bg-night-700'}`} />
                ))}
              </span>
            </span>
            {claimableCount > 0 && (
              <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                {t('home.claim', { count: claimableCount })}
              </span>
            )}
          </Link>
        )}

        <DashboardLeaderboard />

        <FriendsOnlineWidget friends={friends} />

        <SectionDivider />

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-moon-200/40">
          {narrator.supported && (
            <span className="flex items-center gap-1.5">
              <span>🔊</span>
              <button
                type="button"
                onClick={runNarratorTest}
                className="underline underline-offset-4 transition-colors hover:text-moon-200/70"
              >
                {t('dashboard.testNarrator')}
              </button>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span>💬</span>
            <FeedbackButton />
          </span>
        </div>

        <QuoteCarousel />
      </div>

      {/* Pop-up "Créer une partie" : privé ou public, un choix, un clic. */}
      <Modal
        open={narratorTest !== 'idle'}
        onClose={narratorTest === 'testing' ? cancelNarratorTest : closeNarratorTest}
        title={`🔊 ${t('dashboard.narrator.title')}`}
      >
        {narratorTest === 'testing' && (
          <>
            <p className="mb-5 text-sm text-moon-200/70">{t('dashboard.narrator.testing')}</p>
            <Button variant="ghost" className="w-full" onClick={cancelNarratorTest}>
              {t('common.cancel')}
            </Button>
          </>
        )}
        {narratorTest === 'success' && (
          <>
            <p className="mb-5 text-sm text-emerald-400">✅ {t('dashboard.narrator.success')}</p>
            <Button className="w-full" onClick={closeNarratorTest}>
              {t('dashboard.narrator.continue')}
            </Button>
          </>
        )}
        {narratorTest === 'failed' && (
          <>
            <ErrorText>{narratorTestError}</ErrorText>
            <div className="mt-4 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={closeNarratorTest}>
                {t('dashboard.narrator.continue')}
              </Button>
              <Button className="flex-1" onClick={runNarratorTest}>
                {t('dashboard.narrator.retry')}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
