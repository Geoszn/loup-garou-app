import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../hooks/useGame'
import { useNotificationSound } from '../hooks/useNotificationSound'
import { supabase } from '../lib/supabase'
import { BottomActionBar, Button, Card, ConfirmDialog, ErrorText, SideDrawer } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { FriendRequestPopover } from '../components/FriendRequestPopover'
import { ModerationPanel } from '../components/ModerationPanel'
import { JoinRequestsPanel } from '../components/JoinRequestsPanel'
import { VoiceChat } from '../components/VoiceChat'
import { AvatarIcon } from '../components/AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'
import { ROLES } from '../lib/roles'
import type { RoleCounts } from '../types/game'

// Alignés sur compute_default_role_counts côté serveur (voir migration
// 0034) : Capitaine activé d'office (règle simple, vote qui compte double),
// Chasseur et Cupidon désactivés par défaut (à activer volontairement).
const DEFAULT_COUNTS: RoleCounts = {
  loup_garou: 2,
  voyante: true,
  sorciere: true,
  chasseur: false,
  petite_fille: true,
  cupidon: false,
  ancien: false,
  voleur: false,
  capitaine: true,
}

// Durées des phases, modifiables par l'hôte au même titre que les rôles —
// mêmes valeurs par défaut que create_game (voir migrations 0025/0027).
// role_reveal_seconds (durée d'affichage du récap du matin, très courte)
// n'est volontairement pas exposé : ce n'est pas une phase "d'attente" que
// les joueurs voudraient vraiment allonger ou raccourcir.
interface PhaseDurations {
  role_reveal_intro_seconds: number
  discussion_seconds: number
  vote_seconds: number
  vote_recap_seconds: number
  night_step_seconds: number
  wolf_chat_seconds: number
}

const DEFAULT_DURATIONS: PhaseDurations = {
  role_reveal_intro_seconds: 60,
  discussion_seconds: 300,
  vote_seconds: 45,
  vote_recap_seconds: 90,
  night_step_seconds: 70,
  wolf_chat_seconds: 180,
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}min`
  return `${m}min ${s}s`
}

export default function Lobby() {
  const { code } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [gameId, setGameId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [counts, setCounts] = useState<RoleCounts>(DEFAULT_COUNTS)
  const [durations, setDurations] = useState<PhaseDurations>(DEFAULT_DURATIONS)
  const [customized, setCustomized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [friends, setFriends] = useState<{ user_id: string; username: string; avatar_icon: string }[]>([])
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [openFriendId, setOpenFriendId] = useState<string | null>(null)

  useEffect(() => {
    if (!openFriendId) return
    const close = () => setOpenFriendId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openFriendId])

  useEffect(() => {
    supabase.rpc('get_my_social').then(({ data, error }) => {
      if (!error && data) setFriends(data.friends ?? [])
    })
  }, [])

  useEffect(() => {
    if (!code) return
    supabase
      .from('games')
      .select('id')
      .eq('code', code.toUpperCase())
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setResolveError(t('lobby.notFound'))
          return
        }
        setGameId(data.id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const { view, error: gameError } = useGame(gameId)

  // Son + notification navigateur (si l'onglet n'est pas au premier plan)
  // juste avant de rediriger tout le monde vers la partie : sans ça, un
  // joueur qui a l'onglet en fond ne se rend compte que la partie a démarré
  // qu'en y revenant par hasard. Même patron que la notification "demande
  // pour rejoindre" plus bas (son réutilisé : aucun fichier dédié n'existe
  // pour ce moment précis, night-falls.mp3 convient bien en pratique — c'est
  // déjà le son de "l'histoire commence").
  const playGameStartSound = useNotificationSound('/sounds/night-falls.mp3')
  // true dès qu'on a vu `view` au moins une fois avec status === 'lobby' :
  // le son/notif "la partie démarre" ne doit jouer que pour une vraie
  // transition observée en direct pendant qu'on regarde ce salon, jamais au
  // chargement initial (ex. lien direct vers une partie déjà commencée,
  // qui doit quand même rediriger — juste sans faire de bruit).
  const wasInLobbyRef = useRef(false)
  useEffect(() => {
    if (!view) return
    if (view.game.status !== 'lobby') {
      if (wasInLobbyRef.current) {
        playGameStartSound()
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
          try {
            const notif = new Notification(t('lobby.gameStartedNotifTitle'), {
              body: t('lobby.gameStartedNotifBody'),
              icon: '/icons/icon-192.png',
              tag: 'lg-game-start',
            })
            notif.onclick = () => {
              window.focus()
              notif.close()
            }
          } catch {
            /* certains navigateurs refusent silencieusement, rien à faire de plus */
          }
        }
      }
      navigate(`/partie/${view.game.code}`, { replace: true })
      return
    }
    wasInLobbyRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, navigate])

  // Un joueur retiré du salon par l'hôte (kick_player) voit sa ligne
  // supprimée : get_my_game_view se met alors à échouer ("vous ne
  // participez pas...") au lieu de renvoyer un état à jour. On détecte ce
  // cas précis pour le renvoyer au tableau de bord avec une explication,
  // plutôt que de le laisser face à un salon figé sans aucun message.
  useEffect(() => {
    if (gameError && gameError.includes('ne participez pas')) {
      navigate('/dashboard', { state: { notice: t('lobby.kickedNotice') } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameError, navigate])

  const isHost = useMemo(() => {
    if (!view) return false
    return view.players.find((p) => p.user_id === user?.id)?.is_host ?? false
  }, [view, user])

  // Notification (son + notification navigateur si l'onglet n'est pas au
  // premier plan) à chaque NOUVELLE demande pour rejoindre le salon — pas au
  // premier chargement de la page, qui ne doit pas jouer le son pour des
  // demandes déjà là avant même l'ouverture du salon par l'hôte.
  const playJoinRequestSound = useNotificationSound('/sounds/join-request.mp3')
  const hasLoadedRequestsRef = useRef(false)
  const prevRequestCountRef = useRef(0)
  const requestCount = view?.join_requests?.length ?? 0

  useEffect(() => {
    if (!view) return
    if (!hasLoadedRequestsRef.current) {
      hasLoadedRequestsRef.current = true
      prevRequestCountRef.current = requestCount
      return
    }
    if (requestCount > prevRequestCountRef.current) {
      playJoinRequestSound()
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
        try {
          const notif = new Notification(t('lobby.joinRequestNotifTitle'), {
            body: t('lobby.joinRequestNotifBody'),
            icon: '/icons/icon-192.png',
            tag: 'lg-join-request',
          })
          notif.onclick = () => {
            window.focus()
            notif.close()
          }
        } catch {
          /* certains navigateurs refusent silencieusement, rien à faire de plus */
        }
      }
    }
    prevRequestCountRef.current = requestCount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestCount])

  const inviteLink = code ? `${window.location.origin}/rejoindre/${code}` : ''

  // Message prêt à coller (WhatsApp, SMS...) plutôt que le lien tout nu :
  // plus engageant à recevoir, et le code reste lisible même si le lien
  // n'est pas cliquable dans le message (client mail sans aperçu, etc.).
  async function copyLink() {
    await navigator.clipboard.writeText(t('lobby.inviteMessage', { code: code ?? '', link: inviteLink }))
  }

  async function handleStart() {
    if (!gameId) return
    setActionError(null)
    setStarting(true)
    if (customized) {
      await supabase.rpc('update_game_settings', { p_game_id: gameId, p_settings: { role_counts: counts, ...durations } })
    }
    const { error } = await supabase.rpc('start_game', { p_game_id: gameId })
    setStarting(false)
    if (error) setActionError(error.message)
  }

  async function inviteFriend(friendId: string) {
    if (!gameId) return
    setInviteError(null)
    const { error } = await supabase.rpc('invite_friend_to_game', { p_game_id: gameId, p_friend_id: friendId })
    if (error) {
      setInviteError(error.message)
      return
    }
    setInvitedIds((prev) => new Set(prev).add(friendId))
  }

  async function handleLeave() {
    if (!gameId) return
    setConfirmLeaveOpen(false)
    await supabase.rpc('leave_game', { p_game_id: gameId })
    navigate('/dashboard')
  }

  if (resolveError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <div className="mb-3 text-3xl">🌫️</div>
          <ErrorText>{resolveError}</ErrorText>
          <Button className="mt-4" variant="ghost" onClick={() => navigate('/dashboard')}>
            {t('common.backPlain')}
          </Button>
        </Card>
      </div>
    )
  }

  if (!view) return <FullScreenLoader />

  const playerCount = view.players.length
  const invitableFriends = friends.filter((f) => !view.players.some((p) => p.user_id === f.user_id))
  const specialTotal =
    counts.loup_garou +
    Number(counts.voyante) +
    Number(counts.sorciere) +
    Number(counts.chasseur) +
    Number(counts.petite_fille) +
    Number(counts.cupidon) +
    Number(counts.ancien) +
    Number(counts.voleur)
  const rolesOverflow = customized && specialTotal > playerCount

  return (
    <div className="relative min-h-screen px-4 py-6 pb-28 sm:py-10">
      <div className="texture-noise" />
      <div className="relative mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-moon-200/40">{t('lobby.waitingRoom')}</p>
            <h1 className="font-display text-2xl text-moon-200">{t('lobby.gameTitle', { code: code ?? '' })}</h1>
          </div>
          <div className="flex items-center gap-2">
            {isHost && (
              <Button variant="ghost" onClick={() => setSettingsOpen(true)} className="relative px-3.5 py-2 text-xs">
                {t('lobby.settingsButton')}
                {customized && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blood-500" title={t('lobby.customSettingsTitle')} />
                )}
              </Button>
            )}
            <Button variant="danger" onClick={() => setConfirmLeaveOpen(true)} className="px-3.5 py-2 text-xs">
              {t('lobby.leaveButton')}
            </Button>
          </div>
        </header>

        {/* Demandes pour rejoindre : placé tout en haut, juste sous
            l'en-tête, pour que l'hôte ne puisse pas les manquer — avant, ce
            panneau était en bas de page, facile à rater. Concerne les
            parties publiques (recherche) ET, désormais, les parties
            privées rejointes par code pendant qu'elles étaient en cours
            (voir join_game, migration 0038) : view.join_requests n'est
            jamais null pour l'hôte tant que le salon est en 'lobby', qu'il
            y ait des demandes en attente ou non. Pour une partie privée
            (cas rare), on ne montre ce panneau que s'il y a vraiment une
            demande à traiter — sinon la ligne "aucune demande" resterait
            greffée en permanence sur un salon privé classique, qui n'en a
            en pratique jamais. Pour une partie publique, en revanche, on la
            garde visible même vide : c'est un rappel utile que le salon est
            découvrable, avec le côté rassurant du "rien pour l'instant".
            Mis en évidence (bordure + halo) dès qu'il y a au moins une
            demande active. */}
        {isHost && view.join_requests !== null && (requestCount > 0 || view.game.is_public) && (
          <Card
            className={
              requestCount > 0
                ? 'animate-fade-in border-blood-600/70 shadow-blood-glow'
                : '!p-3.5'
            }
          >
            {requestCount > 0 ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 animate-pulse items-center justify-center rounded-full bg-blood-600 text-xs font-bold text-[#fdf6e3]">
                    {requestCount}
                  </span>
                  <h2 className="font-display text-base text-moon-200">
                    {requestCount > 1 ? t('lobby.joinRequestsTitlePlural') : t('lobby.joinRequestsTitleSingular')}
                  </h2>
                </div>
                <JoinRequestsPanel requests={view.join_requests ?? []} />
              </>
            ) : (
              <p className="text-xs text-moon-200/40">
                {view.game.is_public ? t('lobby.publicBadge') : t('lobby.privateBadge')} — {t('lobby.noRequestsYet')}
              </p>
            )}
          </Card>
        )}

        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-moon-200/50">{t('common.gameCodeLabel')}</p>
              <p className="font-display text-3xl tracking-[0.3em] text-moon-300">{code}</p>
            </div>
            <Button variant="ghost" onClick={copyLink}>
              {t('lobby.copyInviteLink')}
            </Button>
          </div>
        </Card>

        {/* Vocal du salon : ouvert à tous les joueurs déjà présents, avant
            même le lancement de la partie, pour discuter en attendant les
            retardataires (voir can_access_channel, migration 0034). */}
        <VoiceChat gameId={gameId!} code={code!} channel="lobby" displayName={view.players.find((p) => p.user_id === user?.id)?.display_name ?? t('common.playerFallback')} />

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg text-moon-200">{t('lobby.playersTitle', { count: playerCount })}</h2>
            {invitableFriends.length > 0 && (
              <button
                type="button"
                onClick={() => setInviteOpen((v) => !v)}
                className="shrink-0 text-xs font-semibold text-moon-300 underline underline-offset-4 transition-colors hover:text-moon-200"
              >
                {inviteOpen ? t('lobby.closeInvite') : t('lobby.inviteFriendsToggle')}
              </button>
            )}
          </div>

          {inviteOpen && invitableFriends.length > 0 && (
            <div className="mb-4 flex flex-col gap-2 border-b border-night-700/60 pb-4">
              <ErrorText>{inviteError}</ErrorText>
              {invitableFriends.map((f) => (
                <div
                  key={f.user_id}
                  className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-1.5 text-moon-200/90">
                    <AvatarIcon icon={f.avatar_icon} className="h-4 w-4" /> {f.username}
                  </span>
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    disabled={invitedIds.has(f.user_id)}
                    onClick={() => inviteFriend(f.user_id)}
                  >
                    {invitedIds.has(f.user_id) ? t('lobby.invited') : t('lobby.inviteButton')}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {view.players.map((p) => {
              const isSelf = p.user_id === user?.id
              return (
                <li key={p.id} className="relative">
                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => !isSelf && setOpenFriendId((cur) => (cur === p.user_id ? null : p.user_id))}
                    title={isSelf ? undefined : t('common.addFriend')}
                    className={`flex w-full items-center gap-2 rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2 text-left text-sm transition-colors ${
                      isSelf ? '' : 'cursor-pointer hover:border-moon-400/50 hover:bg-night-800/60'
                    }`}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-night-950"
                      style={{ backgroundColor: p.avatar_color }}
                    >
                      {p.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-moon-200/90">{p.display_name}</span>
                    {p.is_host && <span className="shrink-0" title={t('common.host')}>👑</span>}
                    {p.is_captain && <span className="shrink-0" title={t('common.captain')}>🎖️</span>}
                  </button>
                  {openFriendId === p.user_id && (
                    <FriendRequestPopover
                      userId={p.user_id}
                      displayName={p.display_name}
                      avatarIcon={p.avatar_icon}
                      onClose={() => setOpenFriendId(null)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </Card>

        <ErrorText>{actionError}</ErrorText>
      </div>

      <BottomActionBar>
        {isHost ? (
          <Button
            onClick={handleStart}
            disabled={starting || playerCount < 4 || rolesOverflow}
            className="w-full py-4 text-base"
          >
            {starting ? t('lobby.starting') : playerCount < 4 ? t('lobby.needMorePlayers') : t('lobby.startGame')}
          </Button>
        ) : (
          <p className="text-center text-sm text-moon-200/50">{t('lobby.waitingForHost')}</p>
        )}
      </BottomActionBar>

      <ConfirmDialog
        open={confirmLeaveOpen}
        title={t('lobby.leaveConfirmTitle')}
        message={t('lobby.leaveConfirmMessage')}
        confirmLabel={t('common.leave')}
        danger
        onCancel={() => setConfirmLeaveOpen(false)}
        onConfirm={handleLeave}
      />

      {isHost && user && (
        <SideDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t('lobby.settingsDrawerTitle')}>
          <div className="flex flex-col gap-5">
            <p className="text-xs text-moon-200/50">
              {t('lobby.rolesSummary', { special: specialTotal, players: playerCount })}
              {playerCount - specialTotal >= 0 ? t('lobby.villagersSuffix', { count: playerCount - specialTotal }) : '.'}
            </p>
            {rolesOverflow && <ErrorText>{t('lobby.rolesOverflow')}</ErrorText>}

            <div className="flex flex-col gap-4">
              <RoleStepper
                label={`🐺 ${t(ROLES.loup_garou.nameKey)}`}
                value={counts.loup_garou}
                min={1}
                max={Math.max(1, Math.floor(playerCount / 2))}
                onChange={(v) => {
                  setCounts((c) => ({ ...c, loup_garou: v }))
                  setCustomized(true)
                }}
              />
              <RoleToggle label={`🔮 ${t(ROLES.voyante.nameKey)}`} checked={counts.voyante} onChange={(v) => { setCounts((c) => ({ ...c, voyante: v })); setCustomized(true) }} />
              <RoleToggle label={`🧪 ${t(ROLES.sorciere.nameKey)}`} checked={counts.sorciere} onChange={(v) => { setCounts((c) => ({ ...c, sorciere: v })); setCustomized(true) }} />
              <RoleToggle label={`🏹 ${t(ROLES.chasseur.nameKey)}`} checked={counts.chasseur} onChange={(v) => { setCounts((c) => ({ ...c, chasseur: v })); setCustomized(true) }} />
              <RoleToggle label={`🎀 ${t(ROLES.petite_fille.nameKey)}`} checked={counts.petite_fille} onChange={(v) => { setCounts((c) => ({ ...c, petite_fille: v })); setCustomized(true) }} />
              <RoleToggle label={`💘 ${t(ROLES.cupidon.nameKey)}`} checked={counts.cupidon} onChange={(v) => { setCounts((c) => ({ ...c, cupidon: v })); setCustomized(true) }} />
              <RoleToggle label={`🧓 ${t(ROLES.ancien.nameKey)}`} checked={counts.ancien} onChange={(v) => { setCounts((c) => ({ ...c, ancien: v })); setCustomized(true) }} />
              <RoleToggle label={`🃏 ${t(ROLES.voleur.nameKey)}`} checked={counts.voleur} onChange={(v) => { setCounts((c) => ({ ...c, voleur: v })); setCustomized(true) }} />
              <div className="border-t border-night-700/60 pt-3">
                <RoleToggle label={`🎖️ ${t('role.capitaine.name')}`} checked={counts.capitaine} onChange={(v) => { setCounts((c) => ({ ...c, capitaine: v })); setCustomized(true) }} />
                <p className="mt-1.5 text-xs text-moon-200/40">{t('lobby.captainToggleHint')}</p>
              </div>
            </div>

            <div className="border-t border-night-700/60 pt-4">
              <h3 className="mb-3 font-display text-sm text-moon-300">{t('lobby.durationsTitle')}</h3>
              <div className="flex flex-col gap-3">
                <DurationStepper
                  label={t('lobby.duration.roleReveal')}
                  value={durations.role_reveal_intro_seconds}
                  min={15} max={180} step={15}
                  onChange={(v) => { setDurations((d) => ({ ...d, role_reveal_intro_seconds: v })); setCustomized(true) }}
                />
                <DurationStepper
                  label={t('lobby.duration.discussion')}
                  value={durations.discussion_seconds}
                  min={60} max={900} step={30}
                  onChange={(v) => { setDurations((d) => ({ ...d, discussion_seconds: v })); setCustomized(true) }}
                />
                <DurationStepper
                  label={t('lobby.duration.vote')}
                  value={durations.vote_seconds}
                  min={15} max={120} step={15}
                  onChange={(v) => { setDurations((d) => ({ ...d, vote_seconds: v })); setCustomized(true) }}
                />
                <DurationStepper
                  label={t('lobby.duration.voteRecap')}
                  value={durations.vote_recap_seconds}
                  min={15} max={180} step={15}
                  onChange={(v) => { setDurations((d) => ({ ...d, vote_recap_seconds: v })); setCustomized(true) }}
                />
                <DurationStepper
                  label={t('lobby.duration.nightSteps')}
                  value={durations.night_step_seconds}
                  min={30} max={180} step={10}
                  onChange={(v) => { setDurations((d) => ({ ...d, night_step_seconds: v })); setCustomized(true) }}
                />
                <DurationStepper
                  label={t('lobby.duration.wolfChat')}
                  value={durations.wolf_chat_seconds}
                  min={60} max={300} step={30}
                  onChange={(v) => { setDurations((d) => ({ ...d, wolf_chat_seconds: v })); setCustomized(true) }}
                />
              </div>
            </div>

            <div className="border-t border-night-700/60 pt-4">
              <h3 className="mb-3 font-display text-sm text-moon-300">{t('moderation.title')}</h3>
              <ModerationPanel view={view} gameId={gameId!} selfId={user.id} />
            </div>
          </div>
        </SideDrawer>
      )}
    </div>
  )
}

function RoleStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-moon-200/80">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-8 w-8 rounded-lg border border-night-500 text-moon-200 hover:bg-night-700"
        >
          −
        </button>
        <span className="w-6 text-center font-semibold text-moon-200">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-8 w-8 rounded-lg border border-night-500 text-moon-200 hover:bg-night-700"
        >
          +
        </button>
      </div>
    </div>
  )
}

function RoleToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-moon-200/80">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-blood-600' : 'bg-night-600'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-moon-200 transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  )
}

/** Même patron que RoleStepper, mais pour une durée en secondes : affiche
 * "5min" / "90s" / "2min 30s" plutôt qu'un nombre brut, plus lisible pour
 * des valeurs qui montent à plusieurs centaines de secondes. */
function DurationStepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-moon-200/80">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          className="h-8 w-8 rounded-lg border border-night-500 text-moon-200 hover:bg-night-700"
        >
          −
        </button>
        <span className="w-16 text-center text-sm font-semibold text-moon-200">{formatDuration(value)}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          className="h-8 w-8 rounded-lg border border-night-500 text-moon-200 hover:bg-night-700"
        >
          +
        </button>
      </div>
    </div>
  )
}
