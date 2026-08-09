import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../hooks/useGame'
import { useNarrator } from '../hooks/useNarrator'
import { useSoundEffects } from '../hooks/useSoundEffects'
import { useTurnNotifications } from '../hooks/useTurnNotifications'
import { supabase } from '../lib/supabase'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { PhaseBanner, NIGHT_STEP_LABEL, NIGHT_STEP_ICON } from '../components/PhaseBanner'
import { RoleCard } from '../components/RoleCard'
import { PlayerGrid } from '../components/PlayerGrid'
import { ReadyGrid } from '../components/ReadyGrid'
import { ActionPanel, VotePanel, CaptainVotePanel } from '../components/ActionPanel'
import { ChatPanel } from '../components/ChatPanel'
import { VoteRecapModal } from '../components/VoteRecapModal'
import { NightRecapModal } from '../components/NightRecapModal'
import { ModerationPanel } from '../components/ModerationPanel'
import { VoiceChat } from '../components/VoiceChat'
import { BottomActionBar, Button, Card, ConfirmDialog, ErrorText, Segmented } from '../components/ui'
import { ROLES, roleLabel, type RoleId } from '../lib/roles'
import { useLanguage } from '../i18n/LanguageContext'
import type { MyGameView, PublicPlayer } from '../types/game'
import type { VoiceChannel } from '../hooks/useVoiceChat'

export default function GameRoom() {
  const { code } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [gameId, setGameId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    supabase
      .from('games')
      .select('id')
      .eq('code', code.toUpperCase())
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setResolveError(t('game.notFound'))
          return
        }
        setGameId(data.id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const { view, error: gameError, onlineUserIds } = useGame(gameId, user?.id ?? null)
  const narrator = useNarrator(gameId)
  const sfx = useSoundEffects(view)
  const notifications = useTurnNotifications(
    view?.pending_action_required ?? null,
    view ? `${view.game.status}-${view.game.night_number}` : 'none'
  )
  // Onglets "Village" (liste des joueurs) / "Discuter" (texte + vocal) pour
  // les phases de jour : évite d'empiler chat, vocal et grille de joueurs
  // les uns sous les autres, un seul écran focalisé à la fois.
  const [dayTab, setDayTab] = useState<'discuss' | 'village'>('discuss')
  const [ghostTab, setGhostTab] = useState<'village' | 'graveyard'>('village')
  // Onglet "Village" (anonyme) / "Loups" (nominatif, uniquement pour les
  // Loups-Garous pendant leur tour) pour la phase de nuit — voir NightChat.
  const [nightTab, setNightTab] = useState<'village' | 'wolves'>('village')
  const [logOpen, setLogOpen] = useState(false)
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  const [modOpen, setModOpen] = useState(false)

  useEffect(() => {
    if (view && view.game.status === 'lobby') {
      navigate(`/partie/${view.game.code}/lobby`, { replace: true })
    }
  }, [view, navigate])

  // Cas de repli : un joueur retiré d'une partie déjà 'ended' voit sa ligne
  // supprimée (comme dans le salon) — get_my_game_view se met alors à
  // échouer. Le cas "retiré en cours de partie" est géré plus bas via
  // death_cause === 'exclu' (la ligne, elle, n'est pas supprimée).
  useEffect(() => {
    if (gameError && gameError.includes('ne participez pas')) {
      navigate('/dashboard', { state: { notice: t('game.kickedNotice') } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameError, navigate])

  // Dès que la fenêtre des loups se referme (ou qu'on n'est plus loup), on
  // revient sur l'onglet "Village" pour ne pas rester bloqué sur un onglet
  // "Loups" devenu inaccessible.
  useEffect(() => {
    const wolfWindowOpen =
      view && view.game.status === 'night' && view.game.night_step === 'loup_garou' && view.my_role === 'loup_garou'
    if (!wolfWindowOpen) setNightTab('village')
  }, [view])

  if (resolveError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <Card className="max-w-md">
          <p className="text-moon-200/70">{resolveError}</p>
          <Button className="mt-4" variant="ghost" onClick={() => navigate('/dashboard')}>
            {t('common.backPlain')}
          </Button>
        </Card>
      </div>
    )
  }

  if (!view || !user) return <FullScreenLoader />

  const me = view.players.find((p) => p.user_id === user.id)
  const alive = me?.is_alive ?? false
  const isHost = me?.is_host ?? false

  // L'hôte vous a exclu de cette partie (kick_player) : contrairement à une
  // élimination normale, on ne montre pas l'écran fantôme habituel (chat du
  // cimetière compris — is_banned coupe de toute façon l'accès côté
  // serveur), juste une explication et un retour à l'accueil.
  if (me?.death_cause === 'exclu') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-4xl">🚫</p>
        <p className="max-w-sm text-moon-200/80">{t('game.excludedMessage')}</p>
        <Button onClick={() => navigate('/dashboard')}>{t('common.backHome')}</Button>
      </div>
    )
  }

  async function handleLeave() {
    setConfirmLeaveOpen(false)
    await supabase.rpc('leave_game', { p_game_id: gameId })
    navigate('/dashboard')
  }

  function requestLeave() {
    setConfirmLeaveOpen(true)
  }

  async function handleRestart() {
    const { error } = await supabase.rpc('restart_game', { p_game_id: gameId })
    if (!error) navigate(`/partie/${code}/lobby`)
  }

  const isNight = view.game.status === 'night' || view.game.status === 'role_reveal'

  // Salon vocal piloté automatiquement par la phase de jeu (le texte, lui,
  // est géré directement dans chaque bloc de statut ci-dessous — voir
  // NightChat pour la nuit). Les morts ont toujours accès au cimetière ; les
  // vivants au village pendant le jour, ainsi que pendant l'élection du
  // Capitaine (captain_election, voir migration 0066) — le texte écrit reste
  // fermé pendant l'élection, seul le vocal s'ouvre. Pas de vocal la nuit.
  let voiceChannel: VoiceChannel = null

  if (!alive) {
    voiceChannel = 'graveyard'
  } else if (['day_reveal', 'day_discussion', 'day_vote', 'captain_election'].includes(view.game.status)) {
    voiceChannel = 'village'
  }

  // `.theme-day` bascule toutes les couleurs night-*/moon-{200,300} de toute
  // l'interface de jeu (voir src/index.css) : blanc de jour, noir de nuit,
  // avec un fondu animé porté par `.game-theme-root` sur chaque enfant.
  return (
    <div
      className={`game-theme-root relative min-h-screen bg-night-950 pb-16 ${isNight ? '' : 'theme-day'}`}
      style={{
        backgroundImage: isNight
          ? 'radial-gradient(circle at 50% -10%, rgb(var(--c-night-600) / 0.35), transparent 55%)'
          : 'radial-gradient(circle at 50% -10%, rgba(198,46,66,0.06), transparent 55%)',
      }}
    >
      {/* Grain léger en surcouche plein écran : casse l'effet d'aplat sans
          coût de rendu supplémentaire par carte. */}
      <div className="texture-noise" />
      <PhaseBanner
        status={view.game.status}
        nightNumber={view.game.night_number}
        nightStep={view.game.night_step}
        deadline={view.game.phase_deadline}
        players={view.players}
        roleCounts={view.game.settings.role_counts}
        onlineUserIds={onlineUserIds}
        selfId={user.id}
        narratorEnabled={narrator.enabled}
        narratorSupported={narrator.supported}
        onToggleNarrator={narrator.toggle}
        sfxEnabled={sfx.enabled}
        sfxSupported={sfx.supported}
        onToggleSfx={sfx.toggle}
        notifEnabled={notifications.enabled}
        notifSupported={notifications.supported}
        onToggleNotif={notifications.toggle}
        onLeave={view.game.status !== 'ended' ? requestLeave : undefined}
        isHost={isHost}
        onOpenModeration={() => setModOpen(true)}
        onExtendTime={async () => {
          const { error } = await supabase.rpc('extend_phase_deadline', { p_game_id: gameId, p_seconds: 30 })
          return error?.message ?? null
        }}
      />

      <div className={`mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4 ${view.game.status === 'role_reveal' ? 'pb-28' : 'pb-4'}`}>
        {/* Le Capitaine qui vient de mourir doit désigner son successeur —
            à ce moment-là il est forcément déjà mort (`captain_pending` n'est
            posé qu'à sa mort dans kill_player), donc ce panneau ne doit PAS
            être conditionné à `alive` comme les blocs "night"/"day_vote"
            ci-dessous, sans quoi il ne s'affiche jamais pour la personne
            censée cliquer dessus. Affiché en dehors de tout statut/alive,
            au-dessus de l'écran fantôme, pour rester visible quelle que soit
            la phase où la mort est survenue. */}
        {view.pending_action_required === 'captain_succession' && (
          <ActionPanel view={view} gameId={gameId!} selfId={user.id} />
        )}

        {!alive && view.game.status !== 'ended' && (
          <div className="flex animate-fade-in flex-col gap-3 rounded-2xl border border-night-500/60 bg-night-950/60 p-4">
            <p className="text-sm text-moon-200/60">
              {view.my_role
                ? t('game.eliminatedNoticeWithRole', { role: roleLabel(view.my_role, t) })
                : t('game.eliminatedNoticeNoRole')}
            </p>
            <GhostTabs
              ghostTab={ghostTab}
              setGhostTab={setGhostTab}
              village={
                <div className="flex flex-col gap-3">
                  {/* Le vocal des vivants n'existe que pendant ces phases-là
                      (voir le calcul de voiceChannel plus haut) : inutile de
                      proposer d'"écouter" un salon qui n'est pas encore ouvert
                      (nuit, salon d'attente entre deux manches, etc.). */}
                  {['day_reveal', 'day_discussion', 'day_vote', 'captain_election'].includes(view.game.status) && (
                    <VoiceChat
                      gameId={gameId!}
                      code={code!}
                      channel="village"
                      displayName={me?.display_name ?? t('common.playerFallback')}
                      listenOnly
                    />
                  )}
                  <ChatPanel gameId={gameId!} channel="village" selfId={user.id} compact readOnly />
                </div>
              }
              graveyard={
                <div className="flex flex-col gap-3">
                  <VoiceChat gameId={gameId!} code={code!} channel={voiceChannel} displayName={me?.display_name ?? t('common.playerFallback')} />
                  <ChatPanel gameId={gameId!} channel="graveyard" selfId={user.id} compact />
                </div>
              }
            />
          </div>
        )}

        {view.game.status === 'role_reveal' && (
          <div className="flex animate-fade-in flex-col items-center gap-4 pt-6">
            <p className="text-sm uppercase tracking-widest text-moon-200/40">{t('game.yourRole')}</p>
            <RoleCard roleId={view.my_role} />
            <ReadyPanel view={view} gameId={gameId!} selfId={user.id} />
          </div>
        )}

        {view.game.status === 'night' && alive && (
          <div className="flex animate-fade-in flex-col gap-4">
            {view.pending_action_required && view.pending_action_required !== 'vote' ? (
              <ActionPanel view={view} gameId={gameId!} selfId={user.id} />
            ) : (
              <WaitingCard alive={alive} myRole={view.my_role} nightStep={view.game.night_step} />
            )}
            {/* Résultat de l'action de cette nuit (Voyante / Petite Fille) :
                affiché indépendamment de `pending_action_required`, qui bascule
                à null dès l'envoi de l'action — donc bien avant que le serveur
                ne change réellement de phase. Sans ce panneau persistant, le
                joueur n'avait qu'une fraction de seconde pour lire son
                résultat avant que l'écran ne repasse en "attente". */}
            <NightResultPanel view={view} />
            <NightChat
              gameId={gameId!}
              selfId={user.id}
              isWolf={view.my_role === 'loup_garou'}
              wolfWindowOpen={view.game.night_step === 'loup_garou'}
              nightTab={nightTab}
              setNightTab={setNightTab}
            />
            <RolePanel myRole={view.my_role} />
          </div>
        )}

        {/* Pop-up plein écran, même patron que day_vote_recap plus bas :
            reste affichée par-dessus le reste tant que la nuit vient d'être
            résolue (statut 'day_reveal'), 30s par défaut ou moins si tous
            les vivants cliquent "Continuer" (voir migration 0041). */}
        {view.game.status === 'day_reveal' && <NightRecapModal view={view} gameId={gameId!} selfId={user.id} />}

        {view.game.status === 'captain_election' && (
          <div className="flex animate-fade-in flex-col gap-4">
            {/* La grille reste affichée après le premier vote (voir
                CaptainVotePanel — submit_captain_vote fait un upsert côté
                serveur) plutôt que de basculer sur un écran d'attente
                générique : ça laisse le temps de changer d'avis avant la
                fin du chrono, avec un bandeau bien visible confirmant que
                le vote est enregistré. */}
            {alive ? (
              <CaptainVotePanel view={view} gameId={gameId!} selfId={user.id} />
            ) : (
              <PlayerGrid players={view.players} selfId={user.id} onlineUserIds={onlineUserIds} />
            )}
            {/* Vocal ouvert pendant l'élection (voir migration 0066) pour que
                le village puisse discuter à voix haute avant de voter — le
                texte écrit, lui, reste fermé pendant cette phase courte. */}
            {alive && (
              <VoiceChat gameId={gameId!} code={code!} channel={voiceChannel} displayName={me?.display_name ?? t('common.playerFallback')} />
            )}
          </div>
        )}

        {view.game.status === 'day_discussion' && (
          <div className="flex animate-fade-in flex-col gap-4">
            <p className="text-center text-sm text-moon-200/50">{t('game.discussionHint')}</p>
            {alive && <CallVotePanel view={view} gameId={gameId!} selfId={user.id} me={me} />}
            {alive ? (
              <DayTabs
                dayTab={dayTab}
                setDayTab={setDayTab}
                voice={
                  <VoiceChat gameId={gameId!} code={code!} channel={voiceChannel} displayName={me?.display_name ?? t('common.playerFallback')} />
                }
                chat={<ChatPanel gameId={gameId!} channel="village" selfId={user.id} />}
                grid={<PlayerGrid players={view.players} selfId={user.id} onlineUserIds={onlineUserIds} />}
              />
            ) : (
              <PlayerGrid players={view.players} selfId={user.id} onlineUserIds={onlineUserIds} />
            )}
          </div>
        )}

        {view.game.status === 'day_vote' && (
          <div className="flex animate-fade-in flex-col gap-4">
            {/* 'hunter'/'captain_succession' : le vote vient d'être dépouillé
                (avant même la fin du chrono si tout le monde avait voté) et
                ce joueur précis a une action spéciale à jouer — la grille de
                vote n'a alors plus lieu d'être, ActionPanel prend le relais.
                Dans tous les autres cas (vote pas encore dépouillé, qu'on
                ait déjà voté ou non), VotePanel reste affiché — voir son
                bandeau "vote enregistré" une fois qu'on a voté, plutôt que
                de basculer sur un écran d'attente qui empêchait de changer
                d'avis. */}
            {alive ? (
              view.pending_action_required === 'hunter' || view.pending_action_required === 'captain_succession' ? (
                <ActionPanel view={view} gameId={gameId!} selfId={user.id} />
              ) : (
                <VotePanel view={view} gameId={gameId!} selfId={user.id} />
              )
            ) : (
              <PlayerGrid players={view.players} selfId={user.id} onlineUserIds={onlineUserIds} />
            )}
            {alive && (
              <DayTabs
                dayTab={dayTab}
                setDayTab={setDayTab}
                voice={
                  <VoiceChat gameId={gameId!} code={code!} channel={voiceChannel} displayName={me?.display_name ?? t('common.playerFallback')} />
                }
                chat={<ChatPanel gameId={gameId!} channel="village" selfId={user.id} compact />}
                grid={<PlayerGrid players={view.players} selfId={user.id} onlineUserIds={onlineUserIds} />}
              />
            )}
          </div>
        )}

        {/* Pop-up plein écran (pas un bloc de page normal) : peu importe où
            elle est déclarée dans le JSX, elle s'affiche par-dessus tout le
            reste tant que le statut est 'day_vote_recap'. */}
        {view.game.status === 'day_vote_recap' && <VoteRecapModal view={view} gameId={gameId!} selfId={user.id} />}

        {modOpen && isHost && (
          <div
            className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm"
            onClick={() => setModOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[85vh] w-full max-w-sm animate-modal-in flex-col overflow-y-auto rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 p-6 shadow-card"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg text-moon-200">{t('moderation.title')}</h2>
                <button
                  type="button"
                  onClick={() => setModOpen(false)}
                  className="text-moon-200/50 transition-colors hover:text-moon-200"
                >
                  ✕
                </button>
              </div>
              <ModerationPanel view={view} gameId={gameId!} selfId={user.id} />
            </div>
          </div>
        )}

        {view.game.status === 'ended' && (
          <EndScreen
            view={view}
            isHost={isHost}
            selfId={user.id}
            gameId={gameId!}
            code={code!}
            displayName={me?.display_name ?? t('common.playerFallback')}
            onRestart={handleRestart}
            onLeave={requestLeave}
          />
        )}

        <Card className="!p-0 border-night-700/60 bg-night-900/40">
          <button
            type="button"
            onClick={() => setLogOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-xs uppercase tracking-widest text-moon-200/40">
              {t('game.logTitle')}{view.log.length > 0 ? ` (${view.log.length})` : ''}
            </span>
            <span className="text-xs text-moon-200/40">{logOpen ? t('common.hide') : t('common.show')}</span>
          </button>
          {logOpen && (
            <div className="px-4 pb-4">
              <LogList entries={view.log} compact />
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmLeaveOpen}
        title={t('game.leaveConfirmTitle')}
        message={
          view.game.status === 'ended'
            ? t('game.leaveConfirmMessageEnded')
            : t('game.leaveConfirmMessageActive')
        }
        confirmLabel={t('common.leave')}
        danger
        onCancel={() => setConfirmLeaveOpen(false)}
        onConfirm={handleLeave}
      />
    </div>
  )
}

/** Bascule entre "Discuter" (vocal + chat) et "Village" (grille des joueurs)
 * pendant les phases de jour, pour qu'un seul bloc de contenu soit visible
 * à la fois plutôt que tout empiler et forcer à scroller.
 *
 * `voice` reste monté EN PERMANENCE, quel que soit l'onglet actif — il était
 * avant démonté/remonté à chaque bascule (comme `chat`/`grid`), ce qui
 * coupait micro + son et forçait une reconnexion à chaque aller-retour entre
 * "Discuter" et "Village". Seule sa visibilité change (`hidden`), la
 * connexion Daily, elle, ne bouge plus. */
function DayTabs({
  dayTab,
  setDayTab,
  voice,
  chat,
  grid,
}: {
  dayTab: 'discuss' | 'village'
  setDayTab: (t: 'discuss' | 'village') => void
  voice: ReactNode
  chat: ReactNode
  grid: ReactNode
}) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        tabs={[
          { id: 'discuss', label: t('tabs.discuss') },
          { id: 'village', label: t('tabs.village') },
        ]}
        active={dayTab}
        onChange={setDayTab}
      />
      <div className={dayTab === 'discuss' ? 'contents' : 'hidden'}>{voice}</div>
      {dayTab === 'discuss' ? chat : grid}
    </div>
  )
}

/** Bascule pour les fantômes entre "Village" (chat du village en lecture
 * seule, pour suivre la partie sans y participer) et "Cimetière" (vocal +
 * chat interactif entre joueurs éliminés) — même patron que DayTabs. */
function GhostTabs({
  ghostTab,
  setGhostTab,
  village,
  graveyard,
}: {
  ghostTab: 'village' | 'graveyard'
  setGhostTab: (t: 'village' | 'graveyard') => void
  village: ReactNode
  graveyard: ReactNode
}) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        tabs={[
          { id: 'village', label: t('tabs.village') },
          { id: 'graveyard', label: t('tabs.graveyard') },
        ]}
        active={ghostTab}
        onChange={setGhostTab}
      />
      {ghostTab === 'village' ? village : graveyard}
    </div>
  )
}

/** Chat de nuit : le village (anonyme, ouvert toute la nuit pour que les
 * joueurs sans action en cours ne s'ennuient pas en silence) et, en plus,
 * uniquement pour les Loups-Garous pendant leur tour, un onglet "Loups"
 * privé et nominatif pour se concerter et choisir leur victime. Même patron
 * que DayTabs / GhostTabs, mais l'onglet "Loups" n'apparaît que s'il est
 * pertinent — pas la peine d'imposer un sélecteur à tout le monde pour un
 * choix qui n'existe que pour les loups. */
function NightChat({
  gameId,
  selfId,
  isWolf,
  wolfWindowOpen,
  nightTab,
  setNightTab,
}: {
  gameId: string
  selfId: string
  isWolf: boolean
  wolfWindowOpen: boolean
  nightTab: 'village' | 'wolves'
  setNightTab: (t: 'village' | 'wolves') => void
}) {
  const { t } = useLanguage()

  if (!(isWolf && wolfWindowOpen)) {
    return <ChatPanel gameId={gameId} channel="village" selfId={selfId} note={t('game.nightChatNote')} />
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        tabs={[
          { id: 'village', label: t('tabs.village') },
          { id: 'wolves', label: t('tabs.wolves') },
        ]}
        active={nightTab}
        onChange={setNightTab}
      />
      {nightTab === 'village' ? (
        <ChatPanel gameId={gameId} channel="village" selfId={selfId} note={t('game.nightChatNote')} />
      ) : (
        <ChatPanel gameId={gameId} channel="wolves" selfId={selfId} />
      )}
    </div>
  )
}

/** Bouton "prêt" pendant la distribution des rôles : dès que tout le monde a
 * cliqué, la partie démarre immédiatement sans attendre la fin des 60s
 * (voir submit_ready côté serveur, qui force l'avancement une fois
 * complet). */
function ReadyPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const me = view.players.find((p) => p.user_id === selfId)
  const readyIds = view.players.filter((p) => p.is_ready).map((p) => p.user_id)

  async function markReady() {
    setLoading(true)
    await supabase.rpc('submit_ready', { p_game_id: gameId })
    setLoading(false)
  }

  return (
    <>
      <Card className="w-full max-w-md">
        <p className="mb-3 text-center text-sm text-moon-200/60">{t('game.readyHint')}</p>
        <ReadyGrid players={view.players} readyIds={readyIds} />
      </Card>
      <BottomActionBar>
        <Button className="w-full py-4 text-base" disabled={me?.is_ready || loading} onClick={markReady}>
          {me?.is_ready ? `✅ ${t('game.readyDone')}` : loading ? t('common.sending') : `✅ ${t('game.readyButton')}`}
        </Button>
      </BottomActionBar>
    </>
  )
}

/** Pendant le débat : chaque joueur vivant (hors Capitaine) peut se
 * déclarer d'accord pour passer au vote. Le Capitaine n'a pas besoin de se
 * déclarer d'accord lui-même — dès que tous les AUTRES joueurs encore en
 * vie le sont, son bouton "Lancer le vote" s'active tout seul, sans étape
 * de confirmation supplémentaire pour lui (il reste le seul à pouvoir
 * appuyer dessus). N'apparaît que si le rôle de Capitaine est activé. */
function CallVotePanel({
  view,
  gameId,
  selfId,
  me,
}: {
  view: MyGameView
  gameId: string
  selfId: string
  me: PublicPlayer | undefined
}) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!view.game.settings.role_counts?.capitaine) return null

  const alivePlayers = view.players.filter((p) => p.is_alive)
  const others = alivePlayers.filter((p) => !p.is_captain)
  const agreedIds = view.vote_call_agreed_ids
  const agreed = agreedIds.includes(selfId)
  const allOthersAgreed = others.length > 0 && others.every((p) => agreedIds.includes(p.user_id))
  const isCaptain = !!me?.is_captain

  async function toggleAgree() {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_vote_call_agreement', { p_game_id: gameId, p_agree: !agreed })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  async function callVote() {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_captain_call_vote', { p_game_id: gameId })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  // Discret plutôt qu'un gros bloc avec la liste nommée de qui a répondu
  // quoi (ReadyGrid) : juste un compte "X/Y" + une fine barre de
  // progression anonyme, sur une seule ligne avec le bouton d'action. Le
  // détail joueur par joueur n'apporte rien d'utile ici (contrairement au
  // vote lui-même, où savoir QUI a voté pour QUI compte) — seul le total
  // compte pour savoir si le débat est prêt à se terminer.
  const progress = others.length > 0 ? agreedIds.length / others.length : 0

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-night-700/40 bg-night-900/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-moon-200/40">
          {t('game.callVoteTitle', { agreed: agreedIds.length, total: others.length })}
        </span>
        <div className="h-1 min-w-[36px] flex-1 overflow-hidden rounded-full bg-night-700/50">
          <div
            className="h-full rounded-full bg-moon-400/70 transition-all duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {!isCaptain && (
          <Button
            variant={agreed ? 'ghost' : 'primary'}
            className="shrink-0 px-3 py-1.5 text-xs"
            disabled={loading}
            onClick={toggleAgree}
          >
            {agreed ? t('game.cancelAgreement') : t('game.agree')}
          </Button>
        )}
        {isCaptain && (
          <Button className="shrink-0 px-3 py-1.5 text-xs" disabled={!allOthersAgreed || loading} onClick={callVote}>
            {allOthersAgreed ? t('game.callVoteButton') : t('game.callVoteButtonWaiting')}
          </Button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

// `voting` a disparu (voir day_vote/captain_election dans GameRoom : la
// grille de vote reste maintenant affichée après un premier vote au lieu de
// basculer sur cet écran d'attente générique) — ne reste utilisé que pour
// la nuit (nightStep) et pour les joueurs éliminés (!alive).
function WaitingCard({
  alive,
  myRole,
  nightStep,
}: {
  alive: boolean
  myRole: string | null
  // Pendant la nuit, plutôt qu'un "en attente des autres joueurs" générique,
  // on nomme le rôle précisément en train d'agir (même texte que le
  // sous-titre du bandeau de phase — voir NIGHT_STEP_LABEL).
  nightStep?: string | null
}) {
  const { t } = useLanguage()
  // Bug corrigé : NIGHT_STEP_LABEL[nightStep] est une CLÉ de traduction
  // ('nightStep.loup_garou'), pas le texte final — il manquait l'appel à
  // t() ici, ce qui affichait la clé brute à l'écran pendant la nuit au
  // lieu de la phrase traduite.
  const nightLabelKey = nightStep ? NIGHT_STEP_LABEL[nightStep] : null
  const nightLabel = nightLabelKey ? t(nightLabelKey) : null
  const nightIcon = nightStep ? NIGHT_STEP_ICON[nightStep] : null

  // Pendant la nuit (vivant) : rendu spécifique, beaucoup plus visible qu'un
  // texte gris générique — une grande icône du rôle en train d'agir,
  // animée, avec un halo doré. C'est le seul repère du joueur sur ce qui se
  // passe pendant que d'autres agissent.
  if (alive && nightLabel) {
    return (
      <Card className="animate-fade-in flex flex-col items-center gap-3 border-moon-400/30 py-8 text-center shadow-glow">
        <span className="animate-breathe text-5xl drop-shadow-[0_0_14px_rgba(224,168,74,0.55)]" aria-hidden="true">
          {nightIcon}
        </span>
        <p className="font-display text-base text-moon-200 sm:text-lg">{nightLabel}</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-moon-200/40">{t('game.waitingOthers')}</p>
      </Card>
    )
  }

  return (
    <Card className="animate-fade-in text-center">
      {!alive ? (
        <p className="text-moon-200/60">
          {myRole
            ? t('game.waitingEliminatedWithRole', { role: roleLabel(myRole, t) })
            : t('game.waitingEliminatedNoRole')}
        </p>
      ) : (
        <p className="animate-breathe text-moon-200/60">{t('game.waitingOthers')}</p>
      )}
    </Card>
  )
}

/** Affiche, pendant toute la durée de la nuit, le résultat de l'action
 * jouée cette nuit-là par la Voyante ou la Petite Fille — dès qu'il est
 * disponible côté serveur — plutôt que de le laisser disparaître dès que
 * `pending_action_required` repasse à null. */
function NightResultPanel({ view }: { view: MyGameView }) {
  const { t } = useLanguage()
  const nightNumber = view.game.night_number

  if (view.my_role === 'voyante') {
    const current = view.seer_reveals.find((r) => r.night_number === nightNumber)
    if (!current) return null
    const target = view.players.find((p) => p.user_id === current.target_id)
    return (
      <Card className="animate-fade-in border-moon-400/30 bg-gradient-to-b from-night-700/40 to-night-900/40">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔮</span>
          <div>
            <p className="font-display text-sm text-moon-200">{t('game.seerVisionTitle')}</p>
            <p className="text-sm text-moon-200/70">
              {t('game.seerVisionResult', {
                target: target?.display_name ?? '?',
                role: roleLabel(current.role, t),
              })}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return null
}

/** Rappel discret du rôle du joueur pendant la nuit — une simple puce
 * dépliable plutôt qu'une carte pleine toujours affichée : le joueur connaît
 * déjà son rôle (révélé en tout début de partie), pas besoin de lui
 * réserver en permanence tout un bloc pour ça au milieu de l'action de la
 * nuit. Un tap dépasse rappelle la description au besoin. */
function RolePanel({ myRole }: { myRole: string | null }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  if (!myRole) return null
  const role = ROLES[myRole as RoleId]
  if (!role) return null
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="animate-fade-in rounded-xl border border-night-700/50 bg-night-900/30 px-3 py-2 text-left transition-colors hover:border-night-600"
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="text-base">{role.emoji}</span>
        <span className="text-moon-200/80">{t(role.nameKey)}</span>
        <span className="ml-auto text-xs text-moon-200/30">{open ? '▲' : 'ⓘ'}</span>
      </div>
      {open && <p className="mt-2 text-xs text-moon-200/50">{t(role.descriptionKey)}</p>}
    </button>
  )
}

function LogList({ entries, compact = false }: { entries: { id: string; message: string }[]; compact?: boolean }) {
  const { t } = useLanguage()
  if (entries.length === 0) return <p className="text-sm text-moon-200/40">{t('game.logEmpty')}</p>
  return (
    <ul className={`flex flex-col gap-1.5 ${compact ? 'max-h-48 overflow-y-auto scrollbar-thin' : ''}`}>
      {entries.map((e) => (
        <li key={e.id} className={`animate-fade-in text-sm text-moon-200/70 ${compact ? 'text-xs' : ''}`}>
          {e.message}
        </li>
      ))}
    </ul>
  )
}

function EndScreen({
  view,
  isHost,
  selfId,
  gameId,
  code,
  displayName,
  onRestart,
  onLeave,
}: {
  view: MyGameView
  isHost: boolean
  selfId: string
  gameId: string
  code: string
  displayName: string
  onRestart: () => void
  onLeave: () => void
}) {
  const { t } = useLanguage()
  const winner = view.game.winner_team
  const title =
    winner === 'village' ? t('game.endVillageWins') : winner === 'loups' ? t('game.endWolvesWin') : t('game.endLoversWin')

  // Explication de la cause de la victoire : le serveur ne renvoie que
  // winner_team ('village' | 'loups' | 'amoureux'), sans détail structuré —
  // on recalcule ici les effectifs finaux à partir de final_reveal (rôle de
  // chacun) croisé avec players.is_alive (dernier état connu, figé puisque
  // la partie est terminée) pour donner une phrase concrète plutôt qu'un
  // simple intitulé de camp. Voir supabase/migrations/0062 (check_and_apply_win)
  // pour la logique serveur exacte reproduite ici côté lecture seule.
  const alivePlayers = view.players.filter((p) => p.is_alive)
  const aliveWolfIds = new Set(
    (view.final_reveal ?? [])
      .filter((r) => r.role === 'loup_garou' && alivePlayers.some((p) => p.user_id === r.user_id))
      .map((r) => r.user_id)
  )
  const wolvesAliveCount = aliveWolfIds.size
  const othersAliveCount = alivePlayers.length - wolvesAliveCount

  const explanation =
    winner === 'village'
      ? t('game.endVillageExplain', { survivors: String(alivePlayers.length) })
      : winner === 'loups'
        ? t('game.endWolvesExplain', { wolves: String(wolvesAliveCount), others: String(othersAliveCount) })
        : t('game.endLoversExplain', {
            lover1: alivePlayers[0]?.display_name ?? '',
            lover2: alivePlayers[1]?.display_name ?? '',
          })

  // Rôle "gagnant" pour la mise en avant visuelle de la liste ci-dessous :
  // toute l'équipe du camp vainqueur pour village/loups, ou seulement les
  // deux amoureux survivants pour une victoire de l'amour (un amoureux peut
  // très bien avoir un rôle villageois ou loup au départ).
  function isWinningEntry(userId: string, role: string): boolean {
    if (winner === 'amoureux') return alivePlayers.some((p) => p.user_id === userId)
    const team = ROLES[role as RoleId]?.team
    return winner === 'loups' ? team === 'loups' : team === 'village'
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code)
  }

  return (
    <Card className="text-center">
      <h2 className="mb-2 font-display text-2xl text-moon-200">{title}</h2>
      <p className="mx-auto mb-5 max-w-sm text-sm text-moon-200/60">{explanation}</p>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {view.final_reveal?.map((r) => {
          const p = view.players.find((pl) => pl.user_id === r.user_id)
          if (!p) return null
          const roleInfo = ROLES[r.role as RoleId]
          const won = isWinningEntry(r.user_id, r.role)
          return (
            <div
              key={r.user_id}
              className={`relative rounded-xl border p-2.5 text-xs ${
                won
                  ? 'border-moon-400/50 bg-moon-400/10 shadow-glow'
                  : 'border-night-600/60 bg-night-900/50 opacity-60'
              }`}
            >
              {won && <span className="absolute -right-1.5 -top-1.5 text-sm">👑</span>}
              <div className="mb-1 text-lg">{roleInfo?.emoji}</div>
              <p className="truncate text-moon-200/90">{p.display_name}</p>
              <p className="text-moon-200/40">{roleLabel(r.role, t)}</p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {isHost && (
          <Button onClick={onRestart} className="w-full">
            {t('game.playAgain')}
          </Button>
        )}
        <Button onClick={onLeave} variant={isHost ? 'ghost' : 'primary'} className="w-full">
          {t('game.leaveLobbyButton')}
        </Button>
      </div>
      {!isHost && (
        <p className="mt-3 text-xs text-moon-200/40">{t('game.waitHostRestart')}</p>
      )}

      {/* Le salon reste ouvert entre deux parties : de nouveaux joueurs
          peuvent encore rejoindre avec le code tant que l'hôte n'a pas
          relancé — cette liste se met à jour en direct pour que tout le
          monde voie qui est présent pour la prochaine manche. */}
      <div className="mt-6 border-t border-night-700/50 pt-5 text-left">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-night-600/60 bg-night-900/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-moon-200/50">{t('common.gameCodeLabel')}</p>
            <p className="font-display text-2xl tracking-[0.3em] text-moon-300">{code}</p>
          </div>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={copyCode}>
            {t('game.copyCode')}
          </Button>
        </div>

        {/* Vocal du salon, comme avant le lancement (canal 'lobby', ouvert
            aussi au statut 'ended' — voir can_access_channel, migration
            0039) : le salon reste ouvert entre deux parties, autant pouvoir
            continuer à discuter en attendant que l'hôte relance. */}
        <div className="mb-4">
          <VoiceChat gameId={gameId} code={code} channel="lobby" displayName={displayName} />
        </div>

        <p className="mb-2 text-xs uppercase tracking-widest text-moon-200/40">
          {t('game.playersPresentForNext', { count: view.players.length })}
        </p>
        <PlayerGrid players={view.players} selfId={selfId} showDeathReveal={false} />
        <p className="mt-2 text-xs text-moon-200/40">{t('game.othersCanStillJoin')}</p>
      </div>
    </Card>
  )
}
