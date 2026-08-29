import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { roleLabel } from '../lib/roles'
import { PlayerGrid } from './PlayerGrid'
import { Button, Card, ConfirmDialog, ErrorText, Modal } from './ui'
import { useLanguage } from '../i18n/LanguageContext'
import type { MyGameView } from '../types/game'

export function ActionPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const action = view.pending_action_required
  const containerRef = useRef<HTMLDivElement>(null)

  // Signale l'arrivée d'un nouveau tour (retour utilisateur : "la Voyante
  // n'a pas reçu le pop-up pour sonder") — vérification en base sur la
  // partie concernée : le serveur ouvrait bien sa fenêtre d'action pendant
  // toute sa durée (aucun bug dans next_night_step / pending_action_required,
  // le panneau s'affiche normalement dans l'immense majorité des parties),
  // mais rien n'attirait l'attention quand le tour démarrait silencieusement
  // juste après une autre phase (ici : l'élection du Capitaine venait de se
  // terminer) — les yeux ailleurs une seconde, on pouvait laisser filer les
  // 70 secondes sans s'en rendre compte. Vibration (mobile) + défilement
  // automatique vers le panneau dès qu'un nouveau tour démarre, même logique
  // que le bandeau pulsant déjà ajouté pour la confirmation d'infection Alpha.
  useEffect(() => {
    if (!action) return
    navigator.vibrate?.([20, 60, 20])
    containerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [action])

  if (!action) return null

  return (
    <div ref={containerRef} className="scroll-mt-4">
      {(() => {
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
      })()}
    </div>
  )
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
// le premier vote envoyé.
//
// Deuxième refonte (demande utilisateur, migration 0108) — la précédente
// (assistant à 3 temps) montrait encore l'étape "choisir une victime" à un
// loup simple même après avoir choisi "Infecter", alors que seul l'Alpha
// doit choisir qui infecter. Nouveau comportement :
// - Un loup SIMPLE choisit une intention ("Éliminer" ou "Infecter" — voir
//   étape 1 plus bas, seulement si un Alpha vivant peut encore infecter).
//   "Éliminer" enchaîne sur le choix d'une victime, comme avant. "Infecter"
//   envoie directement son accord (rien d'autre à décider) — voir
//   chooseInfect ci-dessous, qui réutilise le mécanisme d'abstention déjà
//   existant côté serveur (submit_wolf_vote avec une cible nulle) pour ne
//   jamais peser sur le dépouillement de cible.
// - L'ALPHA, lui, ne voit jamais cette étape d'intention : il désigne
//   toujours directement une victime dès le début de la nuit (comme avant
//   toute refonte), et peut en plus confirmer l'infection une fois la
//   majorité des loups SIMPLES atteinte — la cible déjà désignée devient
//   alors la victime de l'infection au lieu de l'élimination (voir le
//   bouton de confirmation, plus bas dans le rendu).
export function WolfPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const myVote = view.wolf_current_votes?.find((v) => v.actor_id === selfId)
  const hasVoted = myVote !== undefined
  const infectPossible = view.alpha_infect_available
  const agreedIds = new Set(view.alpha_infect_agreed_ids ?? [])
  const myAgreedNow = agreedIds.has(selfId)
  const isAlpha = view.my_role === 'loup_alpha'

  // L'Alpha ne choisit jamais d'intention collective — intent reste figé à
  // 'eliminate' pour lui, ce n'est qu'un nom d'étape interne pour sauter
  // directement à la grille de cible, jamais un vote réel de sa part (voir
  // le commentaire de tête ci-dessus).
  const [intent, setIntent] = useState<'eliminate' | 'infect' | null>(
    isAlpha ? 'eliminate' : hasVoted ? (myAgreedNow ? 'infect' : 'eliminate') : infectPossible ? null : 'eliminate'
  )
  const [selected, setSelected] = useState<string | null>(myVote?.target_id ?? null)
  // Faux tant qu'on n'a pas encore voté cette nuit : montre directement
  // l'assistant. Repasse à false après un envoi réussi (voir confirmChoice/
  // submitAbstain) pour afficher le récapitulatif ; "Modifier mon choix" y
  // repasse à true pour rouvrir l'assistant, pré-rempli avec le choix actuel.
  const [editing, setEditing] = useState(!hasVoted)
  const [confirmOpen, setConfirmOpen] = useState(false)
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

  // Majorité pour débloquer l'infection (migration 0108, demande
  // utilisateur : "le loup alpha ne vote même pas, ce sont les AUTRES
  // loups qui décident") : ne compte plus que les loups SIMPLES vivants,
  // l'Alpha exclu des deux côtés du calcul — avec 1 Alpha + 1 loup simple,
  // le vote de cet unique loup suffit désormais (avant : 2 loups sur 2
  // requis, l'Alpha comptant à tort dans son propre calcul de permission).
  // wolf_alpha_id (migration 0104) identifie précisément qui exclure, sans
  // dépendre de qui regarde (view.my_role).
  const aliveWolfIds = alive
    .filter((p) => (teammates.has(p.user_id) || p.user_id === selfId) && p.user_id !== view.wolf_alpha_id)
    .map((p) => p.user_id)
  const agreedCount = aliveWolfIds.filter((id) => agreedIds.has(id)).length
  const neededAgreements = aliveWolfIds.length === 0 ? 0 : Math.floor(aliveWolfIds.length / 2) + 1
  const majorityReached = agreedCount >= neededAgreements
  const [alphaLoading, setAlphaLoading] = useState(false)
  const [alphaError, setAlphaError] = useState<string | null>(null)
  // Barre de progression de l'accord de meute (0 à 100%) — repère visuel
  // rapide en plus du texte "X / Y", demande utilisateur : rendre la
  // condition de majorité immédiatement lisible d'un coup d'œil.
  const agreementPct = neededAgreements === 0 ? 0 : Math.min(100, Math.round((agreedCount / neededAgreements) * 100))

  const targetPlayer = view.players.find((p) => p.user_id === selected)

  // Choisir un joueur dans la grille ouvre directement le pop-up
  // récapitulatif (étape 3) — rien n'est envoyé au serveur avant que le
  // joueur confirme explicitement.
  function pickTarget(id: string) {
    setSelected(id)
    setConfirmOpen(true)
  }

  // N'est plus jamais appelée avec intent === 'infect' pour un loup simple
  // (voir chooseInfect ci-dessous, qui gère ce cas séparément sans passer
  // par la grille de cible) — seulement pour une élimination, que ce soit
  // un loup simple ou l'Alpha lui-même désignant sa cible du jour.
  async function confirmChoice() {
    if (!selected) return
    setLoading(true)
    setError(null)
    const { error: voteErr } = await supabase.rpc('submit_wolf_vote', { p_game_id: gameId, p_target: selected })
    if (voteErr) {
      setLoading(false)
      setError(voteErr.message)
      return
    }
    // Efface un éventuel accord d'infection donné plus tôt dans le tour
    // (le loup a changé d'avis pour "Éliminer") — jamais pour l'Alpha, qui
    // ne participe pas à ce vote (voir submit_alpha_infect_agreement,
    // migration 0108 : rejette désormais explicitement son rôle).
    if (infectPossible && !isAlpha) {
      const { error: agreeErr } = await supabase.rpc('submit_alpha_infect_agreement', {
        p_game_id: gameId,
        p_agree: false,
      })
      if (agreeErr) {
        setLoading(false)
        setError(agreeErr.message)
        return
      }
    }
    // BUG CORRIGÉ (retour utilisateur, second test) : si l'Alpha avait déjà
    // confirmé l'infection plus tôt dans son tour puis revenait ici choisir
    // "Éliminer" (via le pop-up à double choix ci-dessous), la victime était
    // quand même infectée à la résolution — parce que rien n'annulait son
    // propre alpha_infect_confirmed, resté vrai en arrière-plan. Ce cas
    // n'existait pas pour un loup simple (le bloc juste au-dessus le gère
    // déjà, via SON accord à lui) : seul l'Alpha peut avoir confirmé
    // l'infection lui-même. Choisir "Éliminer" doit toujours vouloir dire
    // éliminer, même après une confirmation d'infection déjà donnée.
    if (isAlpha && view.alpha_infect_confirmed) {
      const { error: confirmErr } = await supabase.rpc('submit_loup_alpha_confirm_infect', {
        p_game_id: gameId,
        p_confirm: false,
      })
      if (confirmErr) {
        setLoading(false)
        setError(confirmErr.message)
        return
      }
    }
    setLoading(false)
    setConfirmOpen(false)
    setEditing(false)
  }

  // BUG CORRIGÉ (retour utilisateur, capture d'écran à l'appui) : une fois
  // la majorité de la meute déjà d'accord pour infecter, l'Alpha choisissait
  // quand même une cible via CE MÊME écran ("Confirmer l'élimination"),
  // pensait avoir confirmé l'infection, et le joueur choisi était tué au
  // lieu d'être infecté — parce que confirmer une cible (submit_wolf_vote)
  // et confirmer l'infection (submit_loup_alpha_confirm_infect) sont deux
  // actions distinctes, la seconde nécessitant un bouton séparé plus bas
  // dans le panneau, facile à ne pas remarquer une fois déjà sur ce pop-up.
  // Désormais, dès que la majorité est atteinte, ce pop-up propose les DEUX
  // issues explicitement (voir le rendu du ConfirmDialog plus bas) — plus
  // aucun moyen d'infecter "par erreur" en croyant confirmer, ni l'inverse.
  async function confirmInfectAsAlpha() {
    if (!selected) return
    setLoading(true)
    setError(null)
    const { error: voteErr } = await supabase.rpc('submit_wolf_vote', { p_game_id: gameId, p_target: selected })
    if (voteErr) {
      setLoading(false)
      setError(voteErr.message)
      return
    }
    const { error: confirmErr } = await supabase.rpc('submit_loup_alpha_confirm_infect', {
      p_game_id: gameId,
      p_confirm: true,
    })
    setLoading(false)
    if (confirmErr) {
      setError(confirmErr.message)
      return
    }
    setConfirmOpen(false)
    setEditing(false)
  }

  // Choix "Infecter" — loups simples uniquement (voir le commentaire de
  // tête de fichier). Envoyé immédiatement, sans étape de cible ni pop-up
  // de confirmation supplémentaire : il n'y a plus rien à décider une fois
  // ce bouton pressé, seul l'Alpha choisira qui infecter. p_target: null
  // réutilise le mécanisme d'abstention déjà existant (submit_wolf_vote) —
  // ce vote ne pèse donc jamais sur le dépouillement de cible
  // (get_wolf_target), qui reste entièrement piloté par la cible que
  // l'Alpha aura lui-même désignée.
  async function chooseInfect() {
    setIntent('infect')
    setLoading(true)
    setError(null)
    const { error: voteErr } = await supabase.rpc('submit_wolf_vote', { p_game_id: gameId, p_target: null })
    if (voteErr) {
      setLoading(false)
      setError(voteErr.message)
      return
    }
    const { error: agreeErr } = await supabase.rpc('submit_alpha_infect_agreement', { p_game_id: gameId, p_agree: true })
    setLoading(false)
    if (agreeErr) {
      setError(agreeErr.message)
      return
    }
    setEditing(false)
  }

  // Possibilité de ne désigner personne : get_wolf_target (migration
  // 0022/0035) ignore déjà les votes à cible nulle dans son dépouillement,
  // donc si toute la meute encore en vie s'abstient (ou si les voix sont
  // partagées à égalité), personne n'est dévoré cette nuit. On efface aussi
  // tout accord d'infection en cours (jamais pour l'Alpha, voir
  // confirmChoice ci-dessus) : s'abstenir n'a de sens que côté élimination.
  async function submitAbstain() {
    setLoading(true)
    setError(null)
    const { error: voteErr } = await supabase.rpc('submit_wolf_vote', { p_game_id: gameId, p_target: null })
    if (!voteErr && infectPossible && !isAlpha) {
      await supabase.rpc('submit_alpha_infect_agreement', { p_game_id: gameId, p_agree: false })
    }
    setLoading(false)
    setConfirmAbstainOpen(false)
    if (voteErr) {
      setError(voteErr.message)
      return
    }
    setIntent('eliminate')
    setSelected(null)
    setEditing(false)
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

  return (
    <PanelShell emoji="🐺" title={t('action.wolf.title')} subtitle={t('action.wolf.subtitle')}>
      {isAlpha && !view.alpha_infect_used && (
        <p className="mb-3 text-xs text-moon-300">{t('action.wolf.alphaDoubleVoteHint')}</p>
      )}

      {/* Récapitulatif du choix déjà envoyé — remplace le bloc de vote tant
          qu'on ne clique pas sur "Modifier mon choix". Cas "infection" à
          part (jamais de cible chez un loup simple dans ce cas — voir
          chooseInfect) : ni "abstenu" ni le nom d'une cible, un message
          dédié. */}
      {!editing && hasVoted && (
        <div className="rounded-xl border border-night-600/60 bg-night-900/40 p-3">
          <p className="text-sm text-moon-200">
            {intent === 'infect' && !isAlpha
              ? t('action.wolf.voteSummaryInfectWaiting')
              : targetPlayer
                ? t('action.wolf.voteSummaryEliminate', { name: targetPlayer.display_name })
                : `✅ ${t('action.wolf.abstained')}`}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 text-xs font-semibold text-moon-300 underline decoration-dotted hover:text-moon-200"
          >
            {t('action.wolf.editChoice')}
          </button>
        </div>
      )}

      {/* Étape 1 : intention — jamais pour l'Alpha (intent reste figé à
          'eliminate' pour lui, cette condition n'est donc jamais vraie),
          seulement pour un loup simple avec un Alpha encore disponible
          pour infecter. */}
      {editing && intent === null && (
        <div className="rounded-xl border border-night-600/60 bg-night-900/40 p-3">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-moon-200/60">
            {t('action.wolf.chooseIntentTitle')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIntent('eliminate')}
              className="flex flex-col items-center gap-1 rounded-xl border border-night-600 bg-night-800/60 px-3 py-3 text-sm font-semibold text-moon-200 transition-colors hover:border-blood-500/60"
            >
              <span className="text-xl">🩸</span>
              {t('action.wolf.intentEliminate')}
            </button>
            <button
              type="button"
              onClick={chooseInfect}
              disabled={loading}
              className="flex flex-col items-center gap-1 rounded-xl border border-emerald-600/40 bg-emerald-900/10 px-3 py-3 text-sm font-semibold text-emerald-400 transition-colors hover:border-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-xl">🧬</span>
              {loading ? t('action.wolf.sendingVote') : t('action.wolf.intentInfect')}
            </button>
          </div>
          <p className="mt-2.5 text-xs text-moon-200/50">{t('action.wolf.alphaInfectSectionSubtitle')}</p>
        </div>
      )}

      {/* Attente — loup simple qui vient de voter "Infecter" (envoyé
          directement par chooseInfect, sans étape de cible) : plus rien à
          faire de son côté, seul l'Alpha choisit qui. */}
      {editing && intent === 'infect' && !isAlpha && (
        <div className="rounded-xl border border-emerald-600/30 bg-emerald-900/10 p-4 text-center">
          <p className="mb-1 text-2xl">🧬</p>
          <p className="text-sm text-moon-200/80">{t('action.wolf.infectWaitingMessage')}</p>
          <button
            type="button"
            onClick={() => setIntent(null)}
            className="mt-3 text-xs text-moon-200/50 underline decoration-dotted hover:text-moon-200"
          >
            {t('action.wolf.changeIntent')}
          </button>
        </div>
      )}

      {/* Étape 2 : victime — l'Alpha y arrive toujours directement (intent
          figé à 'eliminate' pour lui, il désigne une cible dès le début de
          la nuit, comme avant toute refonte), un loup simple seulement
          s'il a choisi "Éliminer". Jamais montrée pour un choix
          "Infecter" (voir le bloc d'attente ci-dessus à la place). */}
      {editing && intent === 'eliminate' && (
        <div className="rounded-xl border border-night-600/60 bg-night-900/40 p-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-moon-200/60">
              {t('action.wolf.chooseTargetEliminateTitle')}
            </p>
            {infectPossible && !isAlpha && (
              <button
                type="button"
                onClick={() => setIntent(null)}
                className="shrink-0 text-xs text-moon-200/50 underline decoration-dotted hover:text-moon-200"
              >
                {t('action.wolf.changeIntent')}
              </button>
            )}
          </div>
          <PlayerGrid
            players={alive}
            selfId={selfId}
            selectable
            compact
            selectedId={selected}
            disabledIds={alive.filter((p) => teammates.has(p.user_id) || p.user_id === selfId).map((p) => p.user_id)}
            onSelect={pickTarget}
          />
          {(votesByTarget.size > 0 || abstainCount > 0) && (
            <p className="mt-3 text-xs text-moon-200/50">
              {[...votesByTarget.entries()]
                .map(([id, n]) => `${view.players.find((p) => p.user_id === id)?.display_name ?? '?'} (${n})`)
                .concat(abstainCount > 0 ? [t('action.wolf.abstainTally', { n: abstainCount })] : [])
                .join(' · ')}
            </p>
          )}
          <button
            type="button"
            onClick={() => setConfirmAbstainOpen(true)}
            disabled={loading}
            className="mt-3 w-full rounded-xl border border-night-600 px-4 py-2.5 text-sm font-semibold text-moon-200/60 transition-colors hover:border-night-500 hover:text-moon-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            🤷 {t('action.wolf.abstainButton')}
          </button>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      {loading && <p className="mt-2 text-xs text-moon-200/40">{t('action.wolf.sendingVote')}</p>}

      {/* Pop-up récapitulatif, obligatoire avant tout envoi réel — jamais
          affichée pour un choix "Infecter" chez un loup simple (envoyé
          directement, rien à confirmer).
          Deux variantes pour l'Alpha : tant que la majorité n'est pas
          atteinte, un seul bouton "Éliminer" comme avant (l'infection n'est
          pas encore une option réelle). Une fois la majorité atteinte —
          qu'il ait déjà cliqué "Confirmer l'infection" plus bas ou pas
          encore, voir confirmInfectAsAlpha/confirmChoice ci-dessus, tous
          deux idempotents dans les deux sens — les deux issues possibles
          sont proposées explicitement l'une à côté de l'autre. */}
      {isAlpha && majorityReached ? (
        <Modal open={confirmOpen && !!targetPlayer} onClose={() => setConfirmOpen(false)} title={t('action.wolf.confirmChoiceTitle')}>
          <p className="mb-6 text-sm text-moon-200/70">
            {targetPlayer ? t('action.wolf.confirmChoiceMessage', { name: targetPlayer.display_name }) : ''}
          </p>
          <div className="flex flex-col gap-2.5">
            <Button
              variant="ghost"
              disabled={loading}
              className="w-full border-emerald-600/50 text-emerald-400 hover:border-emerald-500/70"
              onClick={confirmInfectAsAlpha}
            >
              🧬 {targetPlayer ? t('action.wolf.confirmInfectButton', { name: targetPlayer.display_name }) : ''}
            </Button>
            <Button variant="danger" disabled={loading} className="w-full" onClick={confirmChoice}>
              🩸 {targetPlayer ? t('action.wolf.confirmEliminateButton', { name: targetPlayer.display_name }) : ''}
            </Button>
            <Button variant="ghost" disabled={loading} className="w-full" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </Modal>
      ) : (
        <ConfirmDialog
          open={confirmOpen && !!targetPlayer}
          title={t('action.wolf.confirmEliminateTitle')}
          message={targetPlayer ? t('action.wolf.confirmEliminateMessage', { name: targetPlayer.display_name }) : ''}
          confirmLabel={t('action.wolf.confirmButton')}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmChoice}
        />
      )}

      <ConfirmDialog
        open={confirmAbstainOpen}
        title={t('action.wolf.abstainConfirmTitle')}
        message={t('action.wolf.abstainConfirmMessage')}
        confirmLabel={t('action.wolf.abstainConfirmLabel')}
        onCancel={() => setConfirmAbstainOpen(false)}
        onConfirm={submitAbstain}
      />

      {/* Statut de l'accord de meute pour infecter — indicateur de
          progression basé sur les loups SIMPLES uniquement (voir
          aliveWolfIds plus haut, migration 0108 : l'Alpha exclu du
          calcul), plus le bouton de confirmation finale réservé à l'Alpha
          une fois leur majorité atteinte. */}
      {infectPossible && (
        <div className="mt-4 rounded-xl border border-emerald-600/30 bg-emerald-900/10 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
            {t('action.wolf.packProgressTitle')}
          </p>
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
                  devenait possible. Bannière + halo animé sur le bouton,
                  visibles UNIQUEMENT pendant cette fenêtre (majorité
                  atteinte, pas encore confirmé). */}
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
