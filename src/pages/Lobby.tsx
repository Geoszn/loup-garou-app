import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../hooks/useGame'
import { useNotificationSound } from '../hooks/useNotificationSound'
import { supabase } from '../lib/supabase'
import { notifyGameInvite, notifyGameStarted, isStandaloneDisplay } from '../lib/pushSubscription'
import { BottomActionBar, Button, Card, ConfirmDialog, CopyButton, ErrorText, Segmented, SideDrawer } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { PlayerProfileModal } from '../components/PlayerProfileModal'
import { ModerationPanel } from '../components/ModerationPanel'
import { JoinRequestsPanel } from '../components/JoinRequestsPanel'
import { VoiceChat } from '../components/VoiceChat'
import { AvatarIcon } from '../components/AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { ROLES } from '../lib/roles'
import type { RoleCounts } from '../types/game'

// Alignés sur compute_default_role_counts côté serveur (voir migration
// 0034) : Capitaine activé d'office (règle simple, vote qui compte double),
// Chasseur et Cupidon désactivés par défaut (à activer volontairement).
const DEFAULT_COUNTS: RoleCounts = {
  loup_garou: 2,
  loup_alpha: false,
  voyante: true,
  sorciere: true,
  chasseur: false,
  petite_fille: true,
  cupidon: false,
  ancien: false,
  voleur: false,
  enfant_sauvage: false,
  capitaine: true,
  // Nouveau rôle (voir migration 0116) — désactivé par défaut comme
  // Chasseur/Cupidon ci-dessus, à activer volontairement par l'hôte.
  griot: false,
  // Sans-Visage (voir migration 0118) — même principe, désactivé par défaut.
  sans_visage: false,
  // Anancy (voir migration 0119) — même principe, désactivé par défaut.
  anancy: false,
  // Ange et Grand Méchant Loup (voir migration 0121) — même principe,
  // désactivés par défaut.
  ange: false,
  grand_mechant_loup: false,
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
  // Réglages dédiés Voyante/Sorcière (migration 0080) : avant, ces deux rôles
  // partageaient night_step_seconds avec Voleur/Cupidon/Enfant Sauvage, sans
  // pouvoir leur donner plus de temps individuellement — retour utilisateur,
  // la Voyante n'avait pas assez de temps pour bien regarder sa carte.
  voyante_seconds: number
  sorciere_seconds: number
}

const DEFAULT_DURATIONS: PhaseDurations = {
  role_reveal_intro_seconds: 60,
  discussion_seconds: 300,
  vote_seconds: 45,
  // 30s par défaut, alignée sur le récap de nuit (role_reveal_seconds, déjà
  // à 30s côté serveur) — voir migration 0077 : les deux écrans de récap
  // doivent avoir la même durée par défaut, que ce soit la nuit ou le jour.
  vote_recap_seconds: 30,
  night_step_seconds: 70,
  wolf_chat_seconds: 180,
  voyante_seconds: 70,
  sorciere_seconds: 70,
}

// Préréglages de durée (refonte du panneau de réglages, retour utilisateur :
// 8 curseurs à régler un par un est trop pour la quasi-totalité des hôtes,
// qui veulent juste "rapide/normal/long"). 'normal' reprend exactement
// DEFAULT_DURATIONS — les deux DOIVENT rester synchronisés. Le détail fin
// reste accessible ensuite via les 8 DurationStepper existants, repliés par
// défaut (voir durationsAdvancedOpen).
const DURATION_PRESETS: {
  key: 'fast' | 'normal' | 'long'
  icon: string
  labelKey: TranslationKey
  hintKey: TranslationKey
  values: PhaseDurations
}[] = [
  {
    key: 'fast',
    icon: '⚡',
    labelKey: 'lobby.durationsPreset.fast',
    hintKey: 'lobby.durationsPreset.fastHint',
    values: {
      role_reveal_intro_seconds: 30,
      discussion_seconds: 120,
      vote_seconds: 30,
      vote_recap_seconds: 15,
      night_step_seconds: 40,
      wolf_chat_seconds: 90,
      voyante_seconds: 30,
      sorciere_seconds: 30,
    },
  },
  {
    key: 'normal',
    icon: '🌙',
    labelKey: 'lobby.durationsPreset.normal',
    hintKey: 'lobby.durationsPreset.normalHint',
    values: DEFAULT_DURATIONS,
  },
  {
    key: 'long',
    icon: '🕰️',
    labelKey: 'lobby.durationsPreset.long',
    hintKey: 'lobby.durationsPreset.longHint',
    values: {
      role_reveal_intro_seconds: 90,
      discussion_seconds: 600,
      vote_seconds: 60,
      vote_recap_seconds: 60,
      night_step_seconds: 100,
      wolf_chat_seconds: 240,
      voyante_seconds: 100,
      sorciere_seconds: 100,
    },
  },
]

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}min`
  return `${m}min ${s}s`
}

export default function Lobby() {
  const { code } = useParams()
  const { user, profile } = useAuth()
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
  // Onglet actif du panneau de réglages (refonte — voir plus bas) : Rôles /
  // Durées / Modération, au lieu d'une seule liste qui empilait tout.
  const [settingsTab, setSettingsTab] = useState<'roles' | 'durees' | 'mod'>('roles')
  // Description affichée à la demande (ⓘ) pour UN SEUL rôle à la fois, par
  // groupe — évite d'afficher un paragraphe d'explication en permanence
  // sous chaque rôle activable (retour utilisateur : trop de texte à
  // scroller pour un hôte qui connaît déjà les rôles).
  const [openHint, setOpenHint] = useState<{ group: string; key: string; text: string } | null>(null)
  function toggleHint(group: string, key: string, text: string) {
    setOpenHint((cur) => (cur?.key === key ? null : { group, key, text }))
  }
  // Repliés par défaut : la quasi-totalité des hôtes n'a besoin que d'un
  // préréglage (voir DURATION_PRESETS) et ne touche jamais aux 8 réglages
  // fins individuels.
  const [durationsAdvancedOpen, setDurationsAdvancedOpen] = useState(false)
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [friends, setFriends] = useState<{ user_id: string; username: string; avatar_icon: string }[]>([])
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())
  const [inviteError, setInviteError] = useState<string | null>(null)
  // Mode de test solo (voir migration 0127) : réservé à l'admin, jamais
  // affiché pour un autre compte. addingBot évite un double-clic pendant
  // l'aller-retour réseau (chaque bot ajouté déclenche un re-fetch de la
  // partie via Realtime, pas besoin de mettre à jour l'état local ici).
  const [addingBot, setAddingBot] = useState(false)
  const [botError, setBotError] = useState<string | null>(null)
  // Id du joueur dont la fiche (PlayerProfileModal) est actuellement
  // ouverte — plus besoin d'écouteur "clic en dehors" comme avec l'ancien
  // popover ancré : Modal gère déjà son propre clic sur le fond pour se
  // fermer.
  const [openFriendId, setOpenFriendId] = useState<string | null>(null)

  // Rappel "tu as peut-être déjà l'app installée" (voir le bandeau
  // ci-dessous) : n'a de sens que dans un onglet classique, jamais une fois
  // déjà dans la PWA installée — sinon on se rappellerait à soi-même
  // d'utiliser ce qu'on est déjà en train d'utiliser. Calculé une fois au
  // montage (le mode d'affichage ne change pas en cours de session).
  const [homeScreenHintDismissed, setHomeScreenHintDismissed] = useState(false)
  const showHomeScreenHint = !isStandaloneDisplay() && !homeScreenHintDismissed

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

  // userId passé en 2e argument (voir useGame.ts) pour activer le suivi de
  // présence Realtime : signalement utilisateur — le salon n'affichait aucun
  // indicateur en ligne/hors ligne, empêchant l'hôte de repérer les joueurs
  // déconnectés avant de lancer la partie (contrairement à la grille en jeu,
  // qui l'a déjà via PlayerGrid).
  const { view, error: gameError, onlineUserIds } = useGame(gameId, user?.id)

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
  // Copié via <CopyButton> (voir ui.tsx), qui affiche lui-même la
  // confirmation "Copié !" — plus besoin de gérer cet état ici.
  const inviteMessage = t('lobby.inviteMessage', { code: code ?? '', link: inviteLink })

  async function handleStart() {
    if (!gameId) return
    setActionError(null)
    setStarting(true)
    if (customized) {
      await supabase.rpc('update_game_settings', { p_game_id: gameId, p_settings: { role_counts: counts, ...durations } })
    }
    const { error } = await supabase.rpc('start_game', { p_game_id: gameId })
    setStarting(false)
    if (error) {
      setActionError(error.message)
      return
    }
    // Prévient les joueurs qui ont quitté l'appli (pas dans onlineUserIds,
    // le même canal de présence que le point vert/gris déjà affiché sur
    // chaque joueur ci-dessous) que la partie vient de démarrer — jamais
    // quelqu'un qui a déjà le salon sous les yeux. Best-effort, voir
    // notifyGameStarted.
    const offlineIds = (view?.players ?? []).map((p) => p.user_id).filter((id) => !onlineUserIds.has(id))
    void notifyGameStarted(gameId, offlineIds)
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
    // Best-effort, ne bloque jamais l'invitation elle-même (voir le
    // commentaire de notifyGameInvite) — la plupart des amis n'auront pas
    // encore activé les notifications.
    void notifyGameInvite(gameId, friendId)
  }

  async function addBot() {
    if (!gameId) return
    setAddingBot(true)
    setBotError(null)
    const { error } = await supabase.rpc('admin_add_bot', { p_game_id: gameId })
    setAddingBot(false)
    if (error) setBotError(error.message)
  }

  async function removeBot(botId: string) {
    if (!gameId) return
    setBotError(null)
    const { error } = await supabase.rpc('admin_remove_bot', { p_game_id: gameId, p_bot_id: botId })
    if (error) setBotError(error.message)
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
    Number(counts.loup_alpha) +
    Number(counts.voyante) +
    Number(counts.sorciere) +
    Number(counts.chasseur) +
    Number(counts.petite_fille) +
    Number(counts.cupidon) +
    Number(counts.ancien) +
    Number(counts.voleur) +
    Number(counts.enfant_sauvage) +
    Number(counts.griot) +
    Number(counts.sans_visage) +
    Number(counts.anancy) +
    Number(counts.ange) +
    Number(counts.grand_mechant_loup)
  // Répartition Loups/Village affichée en barre (voir la refonte du panneau
  // ci-dessous) — équilibre lisible d'un coup d'œil plutôt qu'un calcul de
  // tête. Anancy (camp neutre) n'est compté ni comme loup ni comme village,
  // comme dans RosterSummary.tsx.
  const balanceWolves = counts.loup_garou + Number(counts.loup_alpha) + Number(counts.sans_visage) + Number(counts.grand_mechant_loup)
  const balanceVillage =
    Number(counts.voyante) +
    Number(counts.sorciere) +
    Number(counts.chasseur) +
    Number(counts.petite_fille) +
    Number(counts.cupidon) +
    Number(counts.ancien) +
    Number(counts.voleur) +
    Number(counts.enfant_sauvage) +
    Number(counts.griot) +
    Number(counts.ange)
  const balanceTotal = Math.max(balanceWolves + balanceVillage, 1)
  const rolesOverflow = customized && specialTotal > playerCount
  // Contrainte du Loup Alpha (voir migration 0088, assouplie en 0094 —
  // demande utilisateur : retrait du plafond de 2 Loups-Garous simples,
  // devenu obsolète depuis la refonte 0093 où l'Alpha vote avec le reste de
  // la meute) : seuls les 10 joueurs minimum restent requis. Vérifiée aussi
  // côté serveur (start_game) — ceci n'est qu'un avertissement anticipé,
  // même registre que rolesOverflow ci-dessus (pas de blocage dur du
  // toggle, cohérent avec le reste des réglages qui ne grisent jamais un
  // rôle selon le nombre de joueurs).
  const alphaConstraintViolated = counts.loup_alpha && playerCount < 10

  return (
    <div className="relative min-h-screen px-4 py-6 pb-28 sm:py-10">
      <div className="texture-noise" />
      <div className="relative mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-moon-200/40">{t('lobby.waitingRoom')}</p>
            <h1 className="font-display text-2xl text-moon-200">{t('lobby.gameTitle', { code: code ?? '' })}</h1>
          </div>
          {/* gap-4 (au lieu de gap-2) entre "Réglages" et "Quitter" : le
              second est une action destructrice (quitte la partie), le
              premier anodin — un écart plus large réduit le risque de
              mistap sur un téléphone tenu à une main, surtout en haut
              d'écran où le pouce vise le moins précisément. */}
          <div className="flex items-center gap-4">
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

        {/* Un lien d'invitation ouvre toujours un onglet classique, jamais
            l'app installée — Safari (et la plupart des navigateurs mobiles)
            ne permettent pas à un lien web d'ouvrir directement une PWA sur
            l'écran d'accueil, contrairement aux vraies apps de l'App
            Store. Impossible de savoir avec certitude si ce joueur l'a déjà
            installée depuis un onglet classique (voir isStandaloneDisplay
            dans pushSubscription.ts) : le rappel reste donc générique
            plutôt que de prétendre le savoir. */}
        {showHomeScreenHint && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-night-700/60 bg-night-900/40 px-4 py-2.5 text-xs text-moon-200/60">
            <span>📲 {t('lobby.homeScreenHint')}</span>
            <button
              type="button"
              onClick={() => setHomeScreenHintDismissed(true)}
              className="shrink-0 text-moon-200/40 transition-colors hover:text-moon-200"
            >
              ✕
            </button>
          </div>
        )}

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
            <CopyButton value={inviteMessage} label={t('lobby.copyInviteLink')} />
          </div>
        </Card>

        {/* Vocal du salon : ouvert à tous les joueurs déjà présents, avant
            même le lancement de la partie, pour discuter en attendant les
            retardataires (voir can_access_channel, migration 0034). */}
        <VoiceChat
          gameId={gameId!}
          code={code!}
          channel="lobby"
          displayName={view.players.find((p) => p.user_id === user?.id)?.display_name ?? t('common.playerFallback')}
          selfUserId={user?.id ?? null}
          players={view.players}
        />

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg text-moon-200">{t('lobby.playersTitle', { count: playerCount })}</h2>
            <div className="flex items-center gap-3">
              {/* Mode de test solo (voir migration 0127) : réservé à l'admin
                  ET à ses propres salons (isHost) — jamais visible pour un
                  autre compte, ni pour l'admin dans le salon de quelqu'un
                  d'autre. */}
              {profile?.is_admin && isHost && (
                <button
                  type="button"
                  onClick={addBot}
                  disabled={addingBot}
                  className="shrink-0 text-xs font-semibold text-moon-300 underline underline-offset-4 transition-colors hover:text-moon-200 disabled:opacity-50"
                >
                  {addingBot ? t('common.sending') : t('lobby.addBotButton')}
                </button>
              )}
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
          </div>
          {botError && <ErrorText>{botError}</ErrorText>}

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
              // Détection légère : les bots sont ajoutés avec ce préfixe
              // (voir admin_add_bot, migration 0127) — évite de faire
              // transiter is_bot jusque dans get_my_game_view juste pour ce
              // petit bouton admin.
              const isBot = p.display_name.startsWith('🤖 ')
              return (
                <li key={p.id} className="relative">
                  {profile?.is_admin && isHost && isBot && (
                    <button
                      type="button"
                      onClick={() => removeBot(p.user_id)}
                      title={t('lobby.removeBotButton')}
                      className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-night-600 bg-night-800 text-[10px] text-moon-200/60 transition-colors hover:border-blood-500/60 hover:text-blood-400"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => !isSelf && setOpenFriendId(p.user_id)}
                    title={isSelf ? undefined : t('common.viewProfile')}
                    className={`flex w-full items-center gap-2 rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2 text-left text-sm transition-colors ${
                      isSelf ? '' : 'cursor-pointer hover:border-moon-400/50 hover:bg-night-800/60'
                    }`}
                  >
                    <span className="relative inline-flex shrink-0">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-night-950"
                        style={{ backgroundColor: p.avatar_color }}
                      >
                        {p.display_name.slice(0, 1).toUpperCase()}
                      </span>
                      {/* Voyant en ligne/hors ligne (voir onlineUserIds
                          ci-dessus) : permet à l'hôte de repérer d'un coup
                          d'œil qui a vraiment l'appli ouverte avant de
                          lancer la partie, plutôt que de découvrir un
                          joueur absent une fois la partie commencée. */}
                      <span
                        title={onlineUserIds.has(p.user_id) ? t('common.online') : t('common.offline')}
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-900 ${
                          onlineUserIds.has(p.user_id) ? 'bg-emerald-400' : 'bg-night-500'
                        }`}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-moon-200/90">{p.display_name}</span>
                    {p.is_host && <span className="shrink-0" title={t('common.host')}>👑</span>}
                    {p.is_captain && <span className="shrink-0" title={t('common.captain')}>🎖️</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        <ErrorText>{actionError}</ErrorText>
      </div>

      {/* Une seule instance, hors de la boucle ci-dessus : Modal est déjà
          un overlay plein écran (position fixed), pas besoin d'en monter
          une par joueur. */}
      {openFriendId && <PlayerProfileModal userId={openFriendId} onClose={() => setOpenFriendId(null)} />}

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
          <div className="flex flex-col gap-4">
            {/* Résumé + répartition Loups/Village : toujours visibles, quel
                que soit l'onglet actif — vérifier l'équilibre de la partie
                ne devrait jamais nécessiter d'aller chercher un onglet. */}
            <div>
              <p className="text-xs text-moon-200/50">
                {t('lobby.rolesSummary', { special: specialTotal, players: playerCount })}
                {playerCount - specialTotal >= 0 ? t('lobby.villagersSuffix', { count: playerCount - specialTotal }) : '.'}
              </p>
              <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-night-700">
                <div
                  className="bg-gradient-to-r from-blood-600 to-blood-400 transition-all"
                  style={{ width: `${(balanceWolves / balanceTotal) * 100}%` }}
                />
                <div
                  className="bg-gradient-to-r from-moon-400/70 to-moon-300/50 transition-all"
                  style={{ width: `${(balanceVillage / balanceTotal) * 100}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] text-moon-200/35">
                <span>
                  {t('roster.wolves')} ({balanceWolves})
                </span>
                <span>
                  {t('roster.village')} ({balanceVillage})
                </span>
              </div>
            </div>

            {rolesOverflow && <ErrorText>{t('lobby.rolesOverflow')}</ErrorText>}
            {alphaConstraintViolated && <ErrorText>{t('lobby.alphaConstraintViolated')}</ErrorText>}

            <Segmented
              tabs={[
                { id: 'roles' as const, label: t('lobby.settingsTab.roles') },
                { id: 'durees' as const, label: t('lobby.settingsTab.durations') },
                { id: 'mod' as const, label: t('lobby.settingsTab.moderation') },
              ]}
              active={settingsTab}
              onChange={setSettingsTab}
            />

            {settingsTab === 'roles' && (
              <div className="flex flex-col">
                {/* --- Loups --- */}
                <div>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-blood-500" />
                    <h4 className="font-display text-[11px] font-semibold uppercase tracking-wider text-moon-300">
                      {t('lobby.roleGroup.loups')}
                    </h4>
                  </div>
                  <div className="mb-2.5 flex items-center justify-between rounded-xl border border-blood-500/35 bg-gradient-to-b from-blood-600/15 to-blood-600/5 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-semibold text-moon-200">🐺 {t(ROLES.loup_garou.nameKey)}</span>
                    <RoleStepperControls
                      value={counts.loup_garou}
                      min={1}
                      max={Math.max(1, Math.floor(playerCount / 2))}
                      onChange={(v) => {
                        setCounts((c) => ({ ...c, loup_garou: v }))
                        setCustomized(true)
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <RoleChip
                      emoji="👑"
                      label={t(ROLES.loup_alpha.nameKey)}
                      checked={counts.loup_alpha}
                      onChange={(v) => { setCounts((c) => ({ ...c, loup_alpha: v })); setCustomized(true) }}
                      hintOpen={openHint?.key === 'loup_alpha'}
                      onToggleHint={() => toggleHint('loups', 'loup_alpha', t('lobby.alphaToggleHint'))}
                    />
                    <RoleChip
                      emoji="👤"
                      label={t(ROLES.sans_visage.nameKey)}
                      checked={counts.sans_visage}
                      onChange={(v) => { setCounts((c) => ({ ...c, sans_visage: v })); setCustomized(true) }}
                      hintOpen={openHint?.key === 'sans_visage'}
                      onToggleHint={() => toggleHint('loups', 'sans_visage', t('lobby.sansVisageToggleHint'))}
                    />
                    <RoleChip
                      emoji="👹"
                      label={t(ROLES.grand_mechant_loup.nameKey)}
                      checked={counts.grand_mechant_loup}
                      onChange={(v) => { setCounts((c) => ({ ...c, grand_mechant_loup: v })); setCustomized(true) }}
                      hintOpen={openHint?.key === 'grand_mechant_loup'}
                      onToggleHint={() => toggleHint('loups', 'grand_mechant_loup', t('lobby.grandMechantLoupToggleHint'))}
                    />
                  </div>
                  {openHint?.group === 'loups' && <RoleHintBox text={openHint.text} />}
                </div>

                {/* --- Village --- */}
                <div className="mt-5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-moon-400" />
                    <h4 className="font-display text-[11px] font-semibold uppercase tracking-wider text-moon-300">
                      {t('lobby.roleGroup.village')}
                    </h4>
                    <span className="ml-auto text-[11px] text-moon-200/35">{t('lobby.roleGroup.villageHint')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <RoleChip emoji="🔮" label={t(ROLES.voyante.nameKey)} checked={counts.voyante} onChange={(v) => { setCounts((c) => ({ ...c, voyante: v })); setCustomized(true) }} hintOpen={openHint?.key === 'voyante'} onToggleHint={() => toggleHint('village', 'voyante', t('lobby.voyanteToggleHint'))} />
                    <RoleChip emoji="🧪" label={t(ROLES.sorciere.nameKey)} checked={counts.sorciere} onChange={(v) => { setCounts((c) => ({ ...c, sorciere: v })); setCustomized(true) }} hintOpen={openHint?.key === 'sorciere'} onToggleHint={() => toggleHint('village', 'sorciere', t('lobby.sorciereToggleHint'))} />
                    <RoleChip emoji="🏹" label={t(ROLES.chasseur.nameKey)} checked={counts.chasseur} onChange={(v) => { setCounts((c) => ({ ...c, chasseur: v })); setCustomized(true) }} hintOpen={openHint?.key === 'chasseur'} onToggleHint={() => toggleHint('village', 'chasseur', t('lobby.chasseurToggleHint'))} />
                    <RoleChip emoji="🎀" label={t(ROLES.petite_fille.nameKey)} checked={counts.petite_fille} onChange={(v) => { setCounts((c) => ({ ...c, petite_fille: v })); setCustomized(true) }} hintOpen={openHint?.key === 'petite_fille'} onToggleHint={() => toggleHint('village', 'petite_fille', t('lobby.petiteFilleToggleHint'))} />
                    <RoleChip emoji="💘" label={t(ROLES.cupidon.nameKey)} checked={counts.cupidon} onChange={(v) => { setCounts((c) => ({ ...c, cupidon: v })); setCustomized(true) }} hintOpen={openHint?.key === 'cupidon'} onToggleHint={() => toggleHint('village', 'cupidon', t('lobby.cupidonToggleHint'))} />
                    <RoleChip emoji="🧓" label={t(ROLES.ancien.nameKey)} checked={counts.ancien} onChange={(v) => { setCounts((c) => ({ ...c, ancien: v })); setCustomized(true) }} hintOpen={openHint?.key === 'ancien'} onToggleHint={() => toggleHint('village', 'ancien', t('lobby.ancienToggleHint'))} />
                    <RoleChip emoji="🃏" label={t(ROLES.voleur.nameKey)} checked={counts.voleur} onChange={(v) => { setCounts((c) => ({ ...c, voleur: v })); setCustomized(true) }} hintOpen={openHint?.key === 'voleur'} onToggleHint={() => toggleHint('village', 'voleur', t('lobby.voleurToggleHint'))} />
                    <RoleChip emoji="🐾" label={t(ROLES.enfant_sauvage.nameKey)} checked={counts.enfant_sauvage} onChange={(v) => { setCounts((c) => ({ ...c, enfant_sauvage: v })); setCustomized(true) }} hintOpen={openHint?.key === 'enfant_sauvage'} onToggleHint={() => toggleHint('village', 'enfant_sauvage', t('lobby.enfantSauvageToggleHint'))} />
                  </div>
                  {openHint?.group === 'village' && <RoleHintBox text={openHint.text} />}
                </div>

                {/* --- Rôles maison --- */}
                <div className="mt-5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-moon-300" />
                    <h4 className="font-display text-[11px] font-semibold uppercase tracking-wider text-moon-300">
                      {t('lobby.roleGroup.maison')}
                    </h4>
                    <span className="ml-auto text-[11px] text-moon-200/35">{t('lobby.roleGroup.maisonHint')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <RoleChip emoji="🎭" label={t(ROLES.griot.nameKey)} checked={counts.griot} onChange={(v) => { setCounts((c) => ({ ...c, griot: v })); setCustomized(true) }} hintOpen={openHint?.key === 'griot'} onToggleHint={() => toggleHint('maison', 'griot', t('lobby.griotToggleHint'))} />
                    <RoleChip emoji="🕸️" label={t(ROLES.anancy.nameKey)} neutral checked={counts.anancy} onChange={(v) => { setCounts((c) => ({ ...c, anancy: v })); setCustomized(true) }} hintOpen={openHint?.key === 'anancy'} onToggleHint={() => toggleHint('maison', 'anancy', t('lobby.anancyToggleHint'))} />
                    <RoleChip emoji="👼" label={t(ROLES.ange.nameKey)} checked={counts.ange} onChange={(v) => { setCounts((c) => ({ ...c, ange: v })); setCustomized(true) }} hintOpen={openHint?.key === 'ange'} onToggleHint={() => toggleHint('maison', 'ange', t('lobby.angeToggleHint'))} />
                  </div>
                  {openHint?.group === 'maison' && <RoleHintBox text={openHint.text} />}
                </div>

                {/* --- Autre --- */}
                <div className="mt-5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-moon-200/40" />
                    <h4 className="font-display text-[11px] font-semibold uppercase tracking-wider text-moon-300">
                      {t('lobby.roleGroup.other')}
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <RoleChip emoji="🎖️" label={t('role.capitaine.name')} checked={counts.capitaine} onChange={(v) => { setCounts((c) => ({ ...c, capitaine: v })); setCustomized(true) }} hintOpen={openHint?.key === 'capitaine'} onToggleHint={() => toggleHint('autre', 'capitaine', t('lobby.captainToggleHint'))} />
                  </div>
                  {openHint?.group === 'autre' && <RoleHintBox text={openHint.text} />}
                </div>
              </div>
            )}

            {settingsTab === 'durees' && (
              <div>
                <p className="mb-3.5 text-xs leading-relaxed text-moon-200/40">{t('lobby.durationsTitle')}</p>
                <div className="mb-3.5 flex gap-2">
                  {DURATION_PRESETS.map((preset) => {
                    const active = JSON.stringify(durations) === JSON.stringify(preset.values)
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => {
                          setDurations(preset.values)
                          setCustomized(true)
                        }}
                        className={`flex-1 rounded-xl border px-2 py-3 text-center transition-colors ${
                          active
                            ? 'border-blood-400/60 bg-gradient-to-b from-blood-600/24 to-blood-600/10'
                            : 'border-night-600/70 bg-night-900/40 hover:border-moon-400/40'
                        }`}
                      >
                        <span className="block text-base leading-none">{preset.icon}</span>
                        <span className={`mt-1.5 block font-display text-[11.5px] font-semibold ${active ? 'text-moon-200' : 'text-moon-200/80'}`}>
                          {t(preset.labelKey)}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-moon-200/40">{t(preset.hintKey)}</span>
                      </button>
                    )
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setDurationsAdvancedOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border border-night-600/60 bg-night-900/30 px-3.5 py-2.5 text-xs font-semibold text-moon-200/60 transition-colors hover:text-moon-200"
                >
                  <span>{t('lobby.durationsAdvanced', { count: 8 })}</span>
                  <span className={`transition-transform ${durationsAdvancedOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {durationsAdvancedOpen && (
                  <div className="mt-3 flex flex-col gap-3">
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
                      label={t('lobby.duration.voyante')}
                      value={durations.voyante_seconds}
                      min={20} max={180} step={10}
                      onChange={(v) => { setDurations((d) => ({ ...d, voyante_seconds: v })); setCustomized(true) }}
                    />
                    <DurationStepper
                      label={t('lobby.duration.sorciere')}
                      value={durations.sorciere_seconds}
                      min={20} max={180} step={10}
                      onChange={(v) => { setDurations((d) => ({ ...d, sorciere_seconds: v })); setCustomized(true) }}
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
                )}
              </div>
            )}

            {settingsTab === 'mod' && <ModerationPanel view={view} gameId={gameId!} selfId={user.id} />}
          </div>
        </SideDrawer>
      )}
    </div>
  )
}

/** Juste les contrôles −/N/+ (sans libellé) : le Loup-Garou est le seul rôle
 * à effectif variable, mis en avant dans un encart dédié (voir l'onglet
 * Rôles ci-dessus) où le libellé est déjà rendu séparément dans cet
 * encart. */
function RoleStepperControls({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
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
  )
}

/** Carte compacte pour activer/désactiver un rôle (remplace l'ancienne ligne
 * "libellé + interrupteur" empilée verticalement — retour utilisateur :
 * trop de lignes identiques à parcourir). Deux zones cliquables distinctes :
 * la carte entière bascule le rôle, le bouton ⓘ affiche/masque sa
 * description sans y toucher (voir RoleHintBox, un seul ouvert à la fois
 * par groupe). `neutral` affiche le petit badge "neutre" (Anancy, seul rôle
 * hors camp Loups/Village). */
function RoleChip({
  emoji,
  label,
  checked,
  onChange,
  hintOpen,
  onToggleHint,
  neutral = false,
}: {
  emoji: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hintOpen: boolean
  onToggleHint: () => void
  neutral?: boolean
}) {
  const { t } = useLanguage()
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange(!checked)
        }
      }}
      className={`relative flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-2 transition-colors ${
        checked
          ? 'border-blood-400/60 bg-gradient-to-b from-blood-600/28 to-blood-600/14'
          : 'border-night-600/70 bg-night-900/45 hover:border-moon-400/40'
      }`}
    >
      {neutral && (
        <span className="absolute -top-2 right-2 rounded-full border border-moon-400/50 bg-night-800 px-1.5 py-px font-display text-[8px] font-semibold uppercase tracking-wide text-moon-300">
          {t('role.team.neutre')}
        </span>
      )}
      <span className="text-sm leading-none">{emoji}</span>
      <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${checked ? 'text-moon-200' : 'text-moon-200/80'}`}>{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleHint()
        }}
        aria-label={t('common.info')}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] transition-colors ${
          hintOpen ? 'border-moon-400 text-moon-300' : 'border-night-500 text-moon-200/40 hover:border-moon-400/50 hover:text-moon-300'
        }`}
      >
        i
      </button>
    </div>
  )
}

/** Description d'un rôle, affichée sous la grille de son groupe uniquement
 * quand son ⓘ est activé (voir RoleChip) — un seul texte à la fois par
 * groupe, jamais un paragraphe permanent par rôle. */
function RoleHintBox({ text }: { text: string }) {
  return (
    <p className="mt-2 rounded-xl border border-moon-400/25 bg-moon-400/5 px-3 py-2.5 text-xs leading-relaxed text-moon-200/70">{text}</p>
  )
}

/** Même patron que RoleStepperControls, mais pour une durée en secondes : affiche
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
