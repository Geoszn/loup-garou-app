import { useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { roleLabel, ROLES, type RoleId } from '../lib/roles'
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

function VoleurPanel({ view, gameId }: { view: MyGameView; gameId: string }) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const extras = view.thief_extra_roles ?? []

  async function choose(swapRole: string | null) {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_voleur', { p_game_id: gameId, p_swap_role: swapRole })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="🃏" title={t('action.voleur.title')} subtitle={t('action.voleur.subtitle')}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        {extras.map((r, i) => {
          const role = ROLES[r as RoleId]
          return (
            <button
              key={i}
              type="button"
              disabled={loading}
              onClick={() => choose(r)}
              className="flex flex-col items-center gap-2 rounded-xl border border-night-600/60 bg-night-900/50 p-4 text-center transition-colors hover:border-moon-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-3xl">{role?.emoji ?? '❔'}</span>
              <span className="text-sm text-moon-200/90">{roleLabel(r, t)}</span>
            </button>
          )
        })}
      </div>
      <ErrorText>{error}</ErrorText>
      <Button variant="ghost" className="w-full" disabled={loading} onClick={() => choose(null)}>
        {loading ? t('common.sending') : t('action.voleur.keepCard')}
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
      <PlayerGrid players={alive} selectable selectedId={undefined} highlightIds={[first, second].filter(Boolean) as string[]} onSelect={pick} />
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
      <PlayerGrid players={alive} selectable selectedId={selected} onSelect={setSelected} />
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

function WolfPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const myVote = view.wolf_current_votes?.find((v) => v.actor_id === selfId)
  const [selected, setSelected] = useState<string | null>(myVote?.target_id ?? null)
  const [localAbstain, setLocalAbstain] = useState(myVote !== undefined && myVote.target_id === null)
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

  async function submit(id: string | null) {
    setSelected(id)
    setLocalAbstain(id === null)
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_wolf_vote', { p_game_id: gameId, p_target: id })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="🐺" title={t('action.wolf.title')} subtitle={t('action.wolf.subtitle')}>
      <PlayerGrid
        players={alive}
        selfId={selfId}
        selectable
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

function VotePanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<string | null>(view.my_vote_target)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = view.players.filter((p) => p.is_alive)

  async function vote(id: string | null) {
    setSelected(id)
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_vote', { p_game_id: gameId, p_target: id })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="🗳️" title={t('action.vote.title')}>
      <PlayerGrid players={alive} selfId={selfId} selectable selectedId={selected} onSelect={(id) => vote(id)} />
      <Button variant="ghost" className="mt-3 w-full" disabled={loading} onClick={() => vote(null)}>
        {t('common.abstain')}
      </Button>
      <ErrorText>{error}</ErrorText>
    </PanelShell>
  )
}

function CaptainVotePanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<string | null>(view.my_captain_vote_target)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = view.players.filter((p) => p.is_alive)

  async function vote(id: string | null) {
    setSelected(id)
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('submit_captain_vote', { p_game_id: gameId, p_target: id })
    setLoading(false)
    if (rpcError) setError(rpcError.message)
  }

  return (
    <PanelShell emoji="🎖️" title={t('action.captainVote.title')} subtitle={t('action.captainVote.subtitle')}>
      <PlayerGrid players={alive} selfId={selfId} selectable selectedId={selected} onSelect={(id) => vote(id)} />
      <Button variant="ghost" className="mt-3 w-full" disabled={loading} onClick={() => vote(null)}>
        {t('common.abstain')}
      </Button>
      <ErrorText>{error}</ErrorText>
    </PanelShell>
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
      <PlayerGrid players={alive} selfId={selfId} selectable onSelect={choose} />
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
      <PlayerGrid players={alive} selfId={selfId} selectable onSelect={(id) => shoot(id)} />
      <Button variant="ghost" className="mt-3 w-full" disabled={loading} onClick={() => shoot(null)}>
        {t('action.hunter.noShot')}
      </Button>
      <ErrorText>{error}</ErrorText>
    </PanelShell>
  )
}
