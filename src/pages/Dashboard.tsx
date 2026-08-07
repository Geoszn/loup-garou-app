import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Label, Modal } from '../components/ui'
import { RulesPanel } from '../components/RulesPanel'
import { AccountMenu } from '../components/AccountMenu'
import { RankBadge } from '../components/RankBadge'
import { DashboardLeaderboard } from '../components/DashboardLeaderboard'
import { PublicGamesList } from '../components/PublicGamesBrowser'
import { QuoteCarousel } from '../components/QuoteCarousel'
import { AvatarIcon } from '../components/AvatarIcon'
import { useNarrator } from '../hooks/useNarrator'
import { useLanguage } from '../i18n/LanguageContext'

interface GameInvite {
  invite_id: string
  game_id: string
  code: string
  from_username: string
  from_avatar_icon: string
}

interface ActiveGame {
  code: string
  status: string
}

type JoinStep = 'closed' | 'choose' | 'public' | 'code'
type NarratorTestState = 'idle' | 'testing' | 'success' | 'failed'

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
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
  const [pendingFriendCount, setPendingFriendCount] = useState(0)
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

  function resumeActiveGame() {
    if (!activeGame) return
    navigate(activeGame.status === 'lobby' ? `/partie/${activeGame.code}/lobby` : `/partie/${activeGame.code}`)
  }

  // --- Créer une partie -----------------------------------------------------
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreate(isPublic: boolean) {
    setCreateError(null)
    setCreating(true)
    const { data, error: rpcError } = await supabase.rpc('create_game', {
      p_display_name: profile?.username ?? t('common.playerFallback'),
      p_settings: null,
      p_is_public: isPublic,
    })
    setCreating(false)
    if (rpcError) {
      setCreateError(rpcError.message)
      return
    }
    navigate(`/partie/${data.code}/lobby`)
  }

  // --- Rejoindre une partie --------------------------------------------------
  const [joinStep, setJoinStep] = useState<JoinStep>('closed')
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  function closeJoin() {
    setJoinStep('closed')
    setJoinError(null)
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    setJoinError(null)
    if (code.trim().length < 4) {
      setJoinError(t('dashboard.join.error.invalidCode'))
      return
    }
    setJoining(true)
    const { data, error: rpcError } = await supabase.rpc('join_game', {
      p_code: code.trim().toUpperCase(),
      p_display_name: profile?.username ?? t('common.playerFallback'),
    })
    setJoining(false)
    if (rpcError) {
      setJoinError(rpcError.message)
      return
    }
    // La partie peut déjà être en cours (voir join_game, migration 0038) :
    // dans ce cas la demande reste en attente jusqu'à ce que l'hôte y
    // réponde, une fois revenu en salon — même écran que pour les demandes
    // sur une partie publique.
    if (data.status === 'pending') {
      navigate(`/attente/${data.game_id}`, { state: { code: data.code } })
      return
    }
    navigate(`/partie/${data.code}/lobby`)
  }

  // --- Test du narrateur -------------------------------------------------
  // Pas de partie associée ici : useNarrator(null) ne branche ni les
  // abonnements Realtime ni le suivi du journal, seul testVoice() est utile
  // sur cet écran (voir hooks/useNarrator.ts).
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
    setPendingFriendCount((data.incoming_requests ?? []).length)
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
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          {/* Logo cliquable vers la page d'accueil publique — jusqu'ici rien
              sur ce tableau de bord ne permettait d'en sortir autrement
              qu'en fermant l'onglet. */}
          <Link
            to="/"
            title={t('common.backHome')}
            className="flex items-center gap-2 font-display text-lg text-moon-300 transition-opacity hover:opacity-80"
          >
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-full" />
            <span>
              Loup Garou<br className="sm:hidden" /> d'Afrique
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {profile && <RankBadge points={profile.rank_points} streak={profile.current_streak} />}
            <AccountMenu
              username={profile?.username}
              avatarIcon={profile?.avatar_icon}
              pendingFriendCount={pendingFriendCount}
              onSignOut={() => signOut()}
            />
          </div>
        </header>

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

        {/* Partie en cours (voir get_my_active_game) : reste discret mais
            visible tant que la partie n'est pas terminée, pour ne jamais
            perdre le fil d'un salon quitté "à la légère" via le bouton 🏠. */}
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

        {invites.length > 0 && (
          <div className="flex flex-col gap-3">
            {invites.map((invite) => (
              <Card key={invite.invite_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <p className="flex flex-wrap items-center gap-1 text-sm text-moon-200/90">
                  <AvatarIcon icon={invite.from_avatar_icon} className="h-4 w-4" />
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

        {/* Deux actions principales, côte à côte, réduites à l'essentiel :
            chaque bouton ouvre une pop-up qui pose UNE question à la fois
            (privé/public, recherche/code) plutôt que d'étaler tous les choix
            et explications directement sur cette page. */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/60 to-night-900/70 p-6 shadow-card backdrop-blur-sm transition-colors hover:border-moon-400/50"
          >
            <span className="text-3xl">🌕</span>
            <span className="font-display text-sm text-moon-200 sm:text-base">{t('dashboard.createGame')}</span>
          </button>
          <button
            type="button"
            onClick={() => setJoinStep('choose')}
            className="flex flex-col items-center gap-2 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/60 to-night-900/70 p-6 shadow-card backdrop-blur-sm transition-colors hover:border-moon-400/50"
          >
            <span className="text-3xl">🔑</span>
            <span className="font-display text-sm text-moon-200 sm:text-base">{t('dashboard.joinGame')}</span>
          </button>
        </div>

        <DashboardLeaderboard />

        <RulesPanel />

        {narrator.supported && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-moon-200/40">
            <span>🔊</span>
            <button
              type="button"
              onClick={runNarratorTest}
              className="underline underline-offset-4 transition-colors hover:text-moon-200/70"
            >
              {t('dashboard.testNarrator')}
            </button>
          </div>
        )}

        <QuoteCarousel />
      </div>

      {/* Pop-up "Créer une partie" : privé ou public, un choix, un clic. */}
      <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)} title={`🌕 ${t('dashboard.create.title')}`}>
        <div className="flex flex-col gap-3">
          <ChoiceButton
            emoji="🔒"
            title={t('dashboard.create.private.title')}
            subtitle={t('dashboard.create.private.subtitle')}
            disabled={creating}
            onClick={() => handleCreate(false)}
          />
          <ChoiceButton
            emoji="🌍"
            title={t('dashboard.create.public.title')}
            subtitle={t('dashboard.create.public.subtitle')}
            disabled={creating}
            onClick={() => handleCreate(true)}
          />
        </div>
        {creating && <p className="mt-3 text-center text-xs text-moon-200/40">{t('dashboard.create.creating')}</p>}
        <ErrorText>{createError}</ErrorText>
      </Modal>

      {/* Pop-up "Rejoindre une partie" : premier choix (recherche publique
          ou code), puis un second écran adapté selon la réponse — jamais
          les deux options affichées en même temps. */}
      <Modal open={joinStep !== 'closed'} onClose={closeJoin} title={`🔑 ${t('dashboard.join.title')}`}>
        {joinStep === 'choose' && (
          <div className="flex flex-col gap-3">
            <ChoiceButton
              emoji="🔍"
              title={t('dashboard.join.searchPublic.title')}
              subtitle={t('dashboard.join.searchPublic.subtitle')}
              onClick={() => setJoinStep('public')}
            />
            <ChoiceButton
              emoji="🔢"
              title={t('dashboard.join.enterCode.title')}
              subtitle={t('dashboard.join.enterCode.subtitle')}
              onClick={() => setJoinStep('code')}
            />
          </div>
        )}

        {joinStep === 'public' && (
          <div className="flex flex-col gap-3">
            <BackButton onClick={() => setJoinStep('choose')} />
            <PublicGamesList displayName={profile?.username ?? t('common.playerFallback')} />
          </div>
        )}

        {joinStep === 'code' && (
          <div className="flex flex-col gap-3">
            <BackButton onClick={() => setJoinStep('choose')} />
            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="join-code">{t('dashboard.join.codeLabel')}</Label>
                <Input
                  id="join-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="AB12CD"
                  maxLength={8}
                  autoFocus
                  className="tracking-[0.3em] text-center font-display text-lg"
                />
              </div>
              <Button type="submit" disabled={joining} className="w-full">
                {joining ? t('dashboard.join.submitting') : t('dashboard.join.submit')}
              </Button>
              <ErrorText>{joinError}</ErrorText>
            </form>
          </div>
        )}
      </Modal>

      {/* Pop-up "Tester le narrateur" : prévient que ça peut prendre
          plusieurs secondes, permet d'annuler pendant le test, puis propose
          Continuer (succès) ou Recommencer/Continuer (échec) — jamais
          d'échec totalement silencieux comme avant. */}
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

/** Grand bouton de choix, utilisé dans les pop-ups "Créer"/"Rejoindre" pour
 * présenter une alternative claire (icône + titre + une phrase max), plutôt
 * que des cases à cocher ou des formulaires. */
function ChoiceButton({
  emoji,
  title,
  subtitle,
  disabled,
  onClick,
}: {
  emoji: string
  title: string
  subtitle: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-night-600/60 bg-night-900/50 p-4 text-left transition-colors hover:border-moon-400/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="shrink-0 text-2xl">{emoji}</span>
      <span>
        <span className="block text-sm font-semibold text-moon-200">{title}</span>
        <span className="block text-xs text-moon-200/50">{subtitle}</span>
      </span>
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-xs text-moon-200/50 underline underline-offset-4 transition-colors hover:text-moon-200"
    >
      ← Retour
    </button>
  )
}
