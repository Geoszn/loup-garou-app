import { useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { roleLabel } from '../lib/roles'
import { PlayerGrid } from './PlayerGrid'
import { Button, Card, ConfirmDialog, ErrorText } from './ui'
import { useLanguage } from '../i18n/LanguageContext'
import type { MyGameView } from '../types/game'

export function ActionPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const action = view.pending_action_required
  if (!action) return null

  switch (action) {
    case 'voleur':
      return <VoleurPanel view={view} gameId={gameId} />
    case 'cupidon':
      return <CupidonPanel view={view} gameId={gameId} />
    case 'enfant_sauvage':
      return <EnfantSauvagePanel view={view} gameId={gameId} selfId={selfId} />
    case 'voyante':
      return <VoyantePanel view={view} gameId={gameId} selfId={selfId} />
    case 'loup_garou':
      return <WolfPanel view={view} gameId={gameId} selfId={selfId} />
    case 'sorciere':
      return <SorcierePanel view={view} gameId={gameId} selfId={selfId} />
    case 'vote':
      return <VotePanel view={view} gameId={gameId} selfId={selfId} />
    case 'hunter':
      return <HunterPanel view={view} gameId={gameId} selfId={selfId} />
    case 'captain_vote':
      return <CaptainVotePanel view={view} gameId={gameId} selfId={selfId} />
    case 'captain_succession':
      return <CaptainSuccessionPanel view={view} gameId={gameId} selfId={selfId} />
    default:
      return null
  }
}

function PanelShell({ emoji, title, subtitle, children }: { emoji: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="animate-fade-in border-blood-700/40 shadow-blood-glow">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="text-2xl">{emoji}</span>
        <div>
          <h3 className="font-display text-lg text-moon-200">{title}</h3>
          {subtitle && <p className="text-xs text-moon-200/50">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

// Refonte du Voleur (voir migration 0087, demande utilisateur : "il choisit
// juste un joueur au hasard sans connaître sa carte") : plus de choix entre 2
// cartes connues à l'avance — un unique bouton de confirmation, le serveur
// tire la victime au sort et échange les deux cartes à l'aveugle.
function VoleurPanel({ gameId }: { view: MyGameView; gameId: string }) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function steal() {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_voleur', { p_game_id: gameId })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="🃏" title={t('action.voleur.title')} subtitle={t('action.voleur.subtitle')}>
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={loading} onClick={steal}>
        {loading ? t('common.sending') : t('action.voleur.steal')}
      </Button>
    </PanelShell>
  )
}

function CupidonPanel({ view, gameId }: { view: MyGameView; gameId: string }) {
  const { t } = useLanguage()
  const [first, setFirst] = useState<string | null>(null)
  const [second, setSecond] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const alive = view.players.filter((p) => p.is_alive)

  function pick(id: string) {
    if (first === id) { setFirst(second); setSecond(null); return }
    if (second === id) { setSecond(null); return }
    if (!first) { setFirst(id); return }
    if (!second) { setSecond(id); return }
    setFirst(id)
    setSecond(null)
  }

  async function confirm() {
    if (!first || !second) return
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_cupidon', { p_game_id: gameId, p_lover1: first, p_lover2: second })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="💘" title={t('action.cupidon.title')} subtitle={t('action.cupidon.subtitle')}>
      <PlayerGrid players={alive} selectable compact selectedId={undefined} highlightIds={[first, second].filter(Boolean) as string[]} onSelect={pick} />
      <ErrorText>{error}</ErrorText>
      <Button className="mt-4 w-full" disabled={!first || !second || loading} onClick={confirm}>
        {loading ? t('common.sending') : t('action.cupidon.confirm')}
      </Button>
    </PanelShell>
  )
}

function VoyantePanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const alive = view.players.filter((p) => p.is_alive && p.user_id !== selfId)

  async function confirm() {
    if (!selected) return
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_voyante', { p_game_id: gameId, p_target: selected })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="🔮" title={t('action.voyante.title')}>
      <PlayerGrid players={alive} selectable compact selectedId={selected} onSelect={setSelected} />
      {view.seer_reveals.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-night-600/60 pt-3">
          <p className="mb-1 text-xs uppercase tracking-wider text-moon-200/40">{t('action.voyante.pastVisions')}</p>
          {view.seer_reveals.map((r, i) => {
            const p = view.players.find((pl) => pl.user_id === r.target_id)
            return (
              <p key={i} className="text-sm text-moon-200/70">
                {p?.display_name} — <span className="text-moon-300">{roleLabel(r.role, t)}</span>
              </p>
            )
          })}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <Button className="mt-4 w-full" disabled={!selected || loading} onClick={confirm}>
        {loading ? t('common.sending') : t('action.voyante.confirm')}
      </Button>
    </PanelShell>
  )
}

// Choix du mentor par l'Enfant Sauvage — même forme qu'un choix à une seule
// cible (VoyantePanel) : uniquement la première nuit, jamais soi-même. Une
// fois le choix envoyé, submit_enfant_sauvage clôt l'étape de nuit (comme
// submit_voleur/submit_cupidon) : ce panneau ne réapparaît pas ensuite.
function EnfantSauvagePanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const alive = view.players.filter((p) => p.is_alive && p.user_id !== selfId)

  async function confirm() {
    if (!selected) return
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_enfant_sauvage', { p_game_id: gameId, p_mentor_id: selected })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="🐾" title={t('action.enfantSauvage.title')} subtitle={t('action.enfantSauvage.subtitle')}>
      <PlayerGrid players={alive} selectable compact selectedId={selected} onSelect={setSelected} />
      <ErrorText>{error}</ErrorText>
      <Button className="mt-4 w-full" disabled={!selected || loading} onClick={confirm}>
        {loading ? t('common.sending') : t('action.enfantSauvage.confirm')}
      </Button>
    </PanelShell>
  )
}

// Exportée (comme VotePanel/CaptainVotePanel plus bas) : GameRoom.tsx
// l'affiche directement pendant toute la fenêtre de vote des loups, en
// dehors du switch de ActionPanel, au lieu de basculer sur WaitingCard dès
// le premier vote envoyé. submit_wolf_vote fait déjà un upsert côté serveur
// (migration 0035) — revoter change simplement la cible tant que tous les
// loups vivants n'ont pas voté ; seul l'affichage bloquait ce comportement
// pourtant déjà supporté par le serveur.
export function WolfPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const myVote = view.wolf_current_votes?.find((v) => v.actor_id === selfId)
  const [selected, setSelected] = useState<string | null>(myVote?.target_id ?? null)
  const [localAbstain, setLocalAbstain] = useState(myVote !== undefined && myVote.target_id === null)
  const hasVoted = myVote !== undefined
  const [confirmAbstainOpen, setConfirmAbstainOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const teammates = new Set(view.wolf_teammates ?? [])
  const alive = view.players.filter((p) => p.is_alive)
  const votesByTarget = new Map<string, number>()
  let abstainCount = 0
  ;(view.wolf_current_votes ?? []).forEach((v) => {
    if (v.target_id === null) {
      abstainCount += 1
      return
    }
    votesByTarget.set(v.target_id, (votesByTarget.get(v.target_id) ?? 0) + 1)
  })

  // Refonte du Loup Alpha (migration 0093, demande utilisateur : "il faut que
  // la majorité des loups choississent d'infecter pour que l'alpha ai acces
  // a cette option") : l'Alpha vote désormais avec le reste de la meute
  // ci-dessus (son vote pèse double côté serveur, get_wolf_target) — la
  // seule chose spécifique à afficher ici est la section d'accord de meute
  // pour infecter, visible tant qu'un Loup Alpha vivant n'a pas encore
  // utilisé son infection (view.alpha_infect_available), et le bouton de
  // confirmation réservé à l'Alpha lui-même une fois la majorité atteinte.
  const isAlpha = view.my_role === 'loup_alpha'
  const aliveWolfIds = alive.filter((p) => teammates.has(p.user_id) || p.user_id === selfId).map((p) => p.user_id)
  const agreedIds = new Set(view.alpha_infect_agreed_ids ?? [])
  const agreedCount = aliveWolfIds.filter((id) => agreedIds.has(id)).length
  const neededAgreements = aliveWolfIds.length === 0 ? 0 : Math.floor(aliveWolfIds.length / 2) + 1
  const myAgreed = agreedIds.has(selfId)
  const majorityReached = agreedCount >= neededAgreements
  const [alphaLoading, setAlphaLoading] = useState(false)
  const [alphaError, setAlphaError] = useState<string | null>(null)

  async function submit(id: string | null) {
    setSelected(id)
    setLocalAbstain(id === null)
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_wolf_vote', { p_game_id: gameId, p_target: id })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  async function toggleAgreement() {
    setAlphaLoading(true)
    setAlphaError(null)
    const { error: rpcError } = await supabase.rpc('submit_alpha_infect_agreement', { p_game_id: gameId, p_agree: !myAgreed })
    setAlphaLoading(false)
    if (rpcError) setAlphaError(rpcError.message)
  }

  async function toggleAlphaConfirm() {
    setAlphaLoading(true)
    setAlphaError(null)
    const { error: rpcError } = await supabase.rpc('submit_loup_alpha_confirm_infect', {
      p_game_id: gameId,
      p_confirm: !view.alpha_infect_confirmed,
    })
    setAlphaLoading(false)
    if (rpcError) setAlphaError(rpcError.message)
  }

  // Barre de progression de l'accord de meute (0 à 100%) — repère visuel
  // rapide en plus du texte "X / Y", demande utilisateur : rendre la
  // condition de majorité immédiatement lisible d'un coup d'œil.
  const agreementPct = neededAgreements === 0 ? 0 : Math.min(100, Math.round((agreedCount / neededAgreements) * 100))

  return (
    <PanelShell emoji="🐺" title={t('action.wolf.title')} subtitle={t('action.wolf.subtitle')}>
      {isAlpha && !view.alpha_infect_used && (
        <p className="mb-3 text-xs text-moon-300">{t('action.wolf.alphaDoubleVoteHint')}</p>
      )}
      {hasVoted && <VoteRecordedBanner />}

      {/* Bloc 1 : cible à éliminer — toujours affiché, c'est le vote
          "principal". Réorganisation (retour utilisateur, migration 0097) :
          titre numéroté + bloc visuellement isolé, pour que ce soit bien
          distinct de l'option d'infection ci-dessous quand elle existe. */}
      <div className="rounded-xl border border-night-600/60 bg-night-900/40 p-3">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-moon-200/60">
          {t('action.wolf.stepTargetTitle')}
        </p>
        <PlayerGrid
          players={alive}
          selfId={selfId}
          selectable
          compact
          selectedId={selected}
          disabledIds={alive.filter((p) => teammates.has(p.user_id) || p.user_id === selfId).map((p) => p.user_id)}
          onSelect={(id) => submit(id)}
        />
        {(votesByTarget.size > 0 || abstainCount > 0) && (
          <p className="mt-3 text-xs text-moon-200/50">
            {[...votesByTarget.entries()]
              .map(([id, n]) => `${view.players.find((p) => p.user_id === id)?.display_name ?? '?'} (${n})`)
              .concat(abstainCount > 0 ? [t('action.wolf.abstainTally', { n: abstainCount })] : [])
              .join(' · ')}
          </p>
        )}
        <ErrorText>{error}</ErrorText>
        {loading && <p className="mt-2 text-xs text-moon-200/40">{t('action.wolf.sendingVote')}</p>}

        {/* Possibilité de ne désigner personne : get_wolf_target (migration
            0022/0035) ignore déjà les votes à cible nulle dans son
            dépouillement, donc si toute la meute encore en vie s'abstient
            (ou se partage les voix à égalité), personne n'est dévoré cette
            nuit — comme un cas d'égalité classique. Toujours confirmé via
            pop-up pour éviter un clic accidentel sur un choix qui engage
            toute la meute. */}
        <button
          type="button"
          onClick={() => setConfirmAbstainOpen(true)}
          disabled={loading}
          className={`mt-3 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            localAbstain
              ? 'border-moon-400/60 bg-night-800/70 text-moon-200'
              : 'border-night-600 text-moon-200/60 hover:border-night-500 hover:text-moon-200'
          }`}
        >
          {localAbstain ? `✅ ${t('action.wolf.abstained')}` : `🤷 ${t('action.wolf.abstainButton')}`}
        </button>
      </div>

      <ConfirmDialog
        open={confirmAbstainOpen}
        title={t('action.wolf.abstainConfirmTitle')}
        message={t('action.wolf.abstainConfirmMessage')}
        confirmLabel={t('action.wolf.abstainConfirmLabel')}
        onCancel={() => setConfirmAbstainOpen(false)}
        onConfirm={() => {
          setConfirmAbstainOpen(false)
          submit(null)
        }}
      />

      {/* Bloc 2 : accord de meute pour infecter (migration 0093), visible
          tant qu'un Loup Alpha vivant n'a pas encore utilisé son infection.
          Bloc à part entière (bordure + fond distincts) plutôt qu'une simple
          suite de texte après un séparateur — pour qu'on comprenne d'un
          coup d'œil que c'est une option SÉPARÉE du choix de cible ci-dessus,
          pas une suite obligatoire. Chaque loup (Alpha compris) bascule
          librement son accord ; l'Alpha voit en plus un bouton de
          confirmation, actif seulement une fois la majorité atteinte — le
          serveur revérifie tout à la résolution de toute façon, cet
          affichage n'est qu'un guide. */}
      {view.alpha_infect_available && (
        <div className="mt-4 rounded-xl border border-emerald-600/30 bg-emerald-900/10 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
            {t('action.wolf.stepInfectTitle')}
          </p>
          <p className="mb-3 text-xs text-moon-200/50">{t('action.wolf.alphaInfectSectionSubtitle')}</p>

          <button
            type="button"
            onClick={toggleAgreement}
            disabled={alphaLoading}
            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              myAgreed
                ? 'border-emerald-500/60 bg-emerald-700/15 text-emerald-400'
                : 'border-night-600 text-moon-200/60 hover:border-night-500 hover:text-moon-200'
            }`}
          >
            {myAgreed ? t('action.wolf.alphaInfectAgreed') : t('action.wolf.alphaInfectAgreeButton')}
          </button>

          {/* Barre de progression + texte, plus lisible d'un coup d'œil que
              le texte seul pour juger si la majorité est proche. */}
          <div className="mt-2.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-night-800/80">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${agreementPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-moon-200/50">
              {t('action.wolf.alphaInfectProgress', { agreed: agreedCount, needed: neededAgreements })}
            </p>
          </div>

          {isAlpha && (
            <>
              {view.alpha_infect_confirmed && (
                <p className="mt-3 text-xs text-moon-300">{t('action.wolf.alphaInfectConfirmedBanner')}</p>
              )}
              {/* BUG CORRIGÉ (retour utilisateur, partie test) : la majorité
                  était atteinte mais l'Alpha n'a jamais cliqué sur
                  "Confirmer l'infection" avant la fin de son tour — rien
                  n'attirait l'attention au moment précis où l'action
                  devenait possible, noyé sous le reste du panneau (grille de
                  cible, tally, bouton d'abstention...). Bannière + halo
                  animé sur le bouton, visibles UNIQUEMENT pendant cette
                  fenêtre (majorité atteinte, pas encore confirmé). */}
              {majorityReached && !view.alpha_infect_confirmed && (
                <p className="mt-3 animate-pulse text-xs font-semibold text-emerald-400">
                  {t('action.wolf.alphaConfirmInfectReady')}
                </p>
              )}
              <Button
                className={`mt-3 w-full ${
                  majorityReached && !view.alpha_infect_confirmed ? 'ring-2 ring-emerald-400/70 animate-pulse' : ''
                }`}
                variant={view.alpha_infect_confirmed ? 'ghost' : 'primary'}
                disabled={alphaLoading || (!majorityReached && !view.alpha_infect_confirmed)}
                onClick={toggleAlphaConfirm}
              >
                {view.alpha_infect_confirmed ? t('action.wolf.alphaConfirmInfectCancel') : t('action.wolf.alphaConfirmInfectButton')}
              </Button>
              {!majorityReached && !view.alpha_infect_confirmed && (
                <p className="mt-2 text-xs text-moon-200/40">{t('action.wolf.alphaConfirmInfectHint')}</p>
              )}
            </>
          )}
          <ErrorText>{alphaError}</ErrorText>
        </div>
      )}
      {isAlpha && view.alpha_infect_used && (
        <p className="mt-4 border-t border-night-600/60 pt-4 text-xs text-moon-200/40">
          {t('action.wolf.alphaInfectUsedHint')}
        </p>
      )}
    </PanelShell>
  )
}

function SorcierePanel({ view, gameId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [healChoice, setHealChoice] = useState(false)
  const [poisonTarget, setPoisonTarget] = useState<string | null>(null)
  const [poisonPickerOpen, setPoisonPickerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const alive = view.players.filter((p) => p.is_alive)
  const victim = view.players.find((p) => p.user_id === view.wolf_target_visible_to_witch)
  const poisonTargetPlayer = view.players.find((p) => p.user_id === poisonTarget)
  const healAvailable = !view.witch_heal_used && !!victim
  const poisonAvailable = !view.witch_poison_used

  function togglePoisonPicker() {
    if (!poisonAvailable) return
    setPoisonPickerOpen((v) => !v)
  }

  // submit_sorciere termine le tour de la Sorcière dès son tout premier
  // appel (il fait avancer la phase) — impossible d'utiliser les deux
  // potions en deux envois séparés côté serveur. Les deux boutons ci-dessous
  // ne font donc que composer le choix localement ; un seul envoi final,
  // via le bouton de validation, couvre les deux potions à la fois.
  async function confirmSubmit() {
    if (loading) return
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_sorciere', {
      p_game_id: gameId,
      p_heal: healChoice,
      p_poison_target: poisonTarget,
    })
    setLoading(false)
    setConfirmOpen(false)
    if (rpcError) setError(rpcError.message)
  }

  function confirmMessage(): string {
    const parts: string[] = []
    if (healChoice && victim) parts.push(t('action.witch.confirmSave', { name: victim.display_name }))
    if (poisonTarget) parts.push(t('action.witch.confirmPoison', { name: poisonTargetPlayer?.display_name ?? '' }))
    if (parts.length === 0) {
      return t('action.witch.confirmNone')
    }
    return t('action.witch.confirmPrefix', { parts: parts.join(t('action.witch.confirmJoin')) })
  }

  return (
    <PanelShell emoji="🧪" title={t('action.witch.title')}>
      <div className="mb-4 rounded-xl border border-night-600/60 bg-night-900/50 p-3 text-sm">
        {victim ? (
          <p className="text-moon-200/80">{t('action.witch.victimKnown', { name: victim.display_name })}</p>
        ) : (
          <p className="text-moon-200/50">{t('action.witch.victimUnknown')}</p>
        )}
      </div>

      {/* Les deux potions, côte à côte et bien distinctes. */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => healAvailable && setHealChoice((v) => !v)}
          disabled={!healAvailable}
          className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            healChoice ? 'border-emerald-500/70 bg-emerald-700/15' : 'border-night-600/60 bg-night-900/50 hover:border-moon-400/50'
          }`}
        >
          <span className="text-2xl">💚</span>
          <span className="text-sm font-semibold text-moon-200">{t('action.witch.healPotion')}</span>
          <span className="text-[11px] text-moon-200/50">
            {view.witch_heal_used
              ? t('action.witch.healUsed')
              : !victim
                ? t('action.witch.healNoVictim')
                : healChoice
                  ? t('action.witch.healSelected')
                  : t('action.witch.healAction')}
          </span>
        </button>
        <button
          type="button"
          onClick={togglePoisonPicker}
          disabled={!poisonAvailable}
          className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            poisonTarget ? 'border-blood-600/70 bg-blood-700/15' : 'border-night-600/60 bg-night-900/50 hover:border-moon-400/50'
          }`}
        >
          <span className="text-2xl">☠️</span>
          <span className="text-sm font-semibold text-moon-200">{t('action.witch.poisonPotion')}</span>
          <span className="max-w-full truncate text-[11px] text-moon-200/50">
            {view.witch_poison_used
              ? t('action.witch.poisonUsed')
              : poisonTargetPlayer
                ? `${poisonTargetPlayer.display_name} ✓`
                : t('action.witch.poisonAction')}
          </span>
        </button>
      </div>

      {poisonPickerOpen && poisonAvailable && (
        <div className="mb-4">
          <p className="mb-2 text-sm text-moon-200/70">{t('action.witch.choosePoisonTarget')}</p>
          <PlayerGrid
            players={alive}
            selectable
            compact
            selectedId={poisonTarget}
            onSelect={(id) => {
              setPoisonTarget((cur) => (cur === id ? null : id))
              setPoisonPickerOpen(false)
            }}
          />
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <Button className="mt-2 w-full" disabled={loading} onClick={() => setConfirmOpen(true)}>
        {healChoice || poisonTarget ? t('action.witch.validateTurn') : t('action.witch.doNothing')}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title={t('action.witch.confirmTitle')}
        message={confirmMessage()}
        confirmLabel={loading ? t('common.sending') : t('common.confirm')}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmSubmit}
      />
    </PanelShell>
  )
}

// Bandeau "vote enregistré" partagé par VotePanel et CaptainVotePanel —
// bien visible (vert franc, icône, texte en gras) plutôt qu'un simple
// changement de couleur du bouton : c'est le SEUL repère du joueur une fois
// que la grille reste affichée après son premier vote (voir hasVoted dans
// les deux panneaux, et GameRoom.tsx qui ne bascule plus vers un écran
// d'attente générique dès le premier vote envoyé).
function VoteRecordedBanner() {
  const { t } = useLanguage()
  return (
    <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/60 bg-emerald-700/15 px-3.5 py-2.5">
      <span className="text-xl" aria-hidden="true">
        ✅
      </span>
      <p className="text-sm font-semibold text-emerald-400">{t('action.voteRecorded')}</p>
    </div>
  )
}

// Exportée (comme CaptainVotePanel plus bas) : GameRoom.tsx l'utilise
// directement, en dehors du switch de ActionPanel, pour continuer à
// l'afficher même une fois pending_action_required retombé à null après le
// premier vote (voir le commentaire sur hasVoted ci-dessous et
// GameRoom.tsx). submit_vote fait un upsert côté serveur (migration
// 0005) : revoter change simplement la cible tant que le vote n'a pas été
// dépouillé, et si tout le monde a voté, la partie avance immédiatement
// sans attendre la fin du chrono — déjà géré côté serveur, rien à faire ici.
export function VotePanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<string | null>(view.my_vote_target)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = view.players.filter((p) => p.is_alive)
  // Un vote existe dès que le serveur ne réclame plus l'action 'vote' pour
  // ce joueur (voir get_my_game_view) — distinct de `selected === null`, qui
  // peut aussi bien vouloir dire "pas encore voté" que "vote pour
  // s'abstenir".
  const hasVoted = view.pending_action_required !== 'vote'

  async function vote(id: string | null) {
    setSelected(id)
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_vote', { p_game_id: gameId, p_target: id })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <Card
      className={`animate-fade-in transition-colors ${hasVoted ? 'border-emerald-500/40 shadow-glow' : 'border-blood-700/40 shadow-blood-glow'}`}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="text-2xl">🗳️</span>
        <h3 className="font-display text-lg text-moon-200">{t('action.vote.title')}</h3>
      </div>
      {hasVoted && <VoteRecordedBanner />}
      <PlayerGrid players={alive} selfId={selfId} selectable compact selectedId={selected} onSelect={(id) => vote(id)} />
      <Button variant="ghost" className="mt-3 w-full" disabled={loading} onClick={() => vote(null)}>
        {t('common.abstain')}
      </Button>
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}

// Voir le commentaire sur VotePanel ci-dessus — même principe pour
// l'élection du Capitaine (submit_captain_vote, migration 0018, upsert +
// avance anticipée déjà gérés côté serveur).
export function CaptainVotePanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<string | null>(view.my_captain_vote_target)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = view.players.filter((p) => p.is_alive)
  const hasVoted = view.pending_action_required !== 'captain_vote'

  async function vote(id: string | null) {
    setSelected(id)
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_captain_vote', { p_game_id: gameId, p_target: id })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <Card
      className={`animate-fade-in transition-colors ${hasVoted ? 'border-emerald-500/40 shadow-glow' : 'border-blood-700/40 shadow-blood-glow'}`}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="text-2xl">🎖️</span>
        <div>
          <h3 className="font-display text-lg text-moon-200">{t('action.captainVote.title')}</h3>
          <p className="text-xs text-moon-200/50">{t('action.captainVote.subtitle')}</p>
        </div>
      </div>
      {hasVoted && <VoteRecordedBanner />}
      <PlayerGrid players={alive} selfId={selfId} selectable compact selectedId={selected} onSelect={(id) => vote(id)} />
      <Button variant="ghost" className="mt-3 w-full" disabled={loading} onClick={() => vote(null)}>
        {t('common.abstain')}
      </Button>
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}

function CaptainSuccessionPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Le Capitaine qui vient de mourir n'est plus "vivant" dans la grille —
  // inutile de s'auto-exclure comme les autres panneaux, il n'apparaît déjà
  // plus.
  const alive = view.players.filter((p) => p.is_alive)

  async function choose(id: string) {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_captain_succession', { p_game_id: gameId, p_successor_id: id })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell
      emoji="🎖️"
      title={t('action.captainSuccession.title')}
      subtitle={t('action.captainSuccession.subtitle')}
    >
      <PlayerGrid players={alive} selfId={selfId} selectable compact onSelect={choose} />
      <ErrorText>{error}</ErrorText>
      {loading && <p className="mt-2 text-xs text-moon-200/40">{t('common.sending')}</p>}
    </PanelShell>
  )
}

function HunterPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = view.players.filter((p) => p.is_alive && p.user_id !== selfId)

  async function shoot(id: string | null) {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_hunter_shot', { p_game_id: gameId, p_target: id })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="🏹" title={t('action.hunter.title')} subtitle={t('action.hunter.subtitle')}>
      <PlayerGrid players={alive} selfId={selfId} selectable compact onSelect={(id) => shoot(id)} />
      <Button variant="ghost" className="mt-3 w-full" disabled={loading} onClick={() => shoot(null)}>
        {t('action.hunter.noShot')}
      </Button>
      <ErrorText>{error}</ErrorText>
    </PanelShell>
  )
}
