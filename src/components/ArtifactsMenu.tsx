import { useState, type ReactNode } from 'react'
import { gameRpc } from '../lib/gameRpc'
import { Button, ErrorText } from './ui'
import { PlayerGrid } from './PlayerGrid'
import { useLanguage } from '../i18n/LanguageContext'
import { useAuth } from '../context/AuthContext'
import type { MyGameView } from '../types/game'

/** Vrai si le menu "🎒 Mes artefacts" a quelque chose à montrer pour ce
 * joueur — sert à la fois à savoir si l'icône doit apparaître dans
 * PhaseBanner et si un point rouge doit la signaler comme "à consulter"
 * (voir GameRoom.tsx). Un seul artefact "actif" existe pour l'instant
 * (Parchemin du Griot, migration 0179) ; Dernier Souffle n'apparaît ici
 * qu'une fois déjà utilisé, en simple rappel (le formulaire d'envoi
 * lui-même reste affiché ailleurs sur l'écran fantôme, pas dans ce menu). */
export function hasArtifactsToShow(view: MyGameView): boolean {
  return view.my_owns_parchemin_griot || (view.my_owns_dernier_souffle && view.my_dernier_souffle_used) || hasOeilBaobabToShow(view)
}

/** L'Œil du Baobab a quelque chose à montrer : une charge en réserve, ou le résultat déjà obtenu dans cette partie. */
export function hasOeilBaobabToShow(view: MyGameView): boolean {
  return view.my_oeil_baobab_stock > 0 || !!view.my_oeil_baobab_result
}

/** L'Œil du Baobab est utilisable maintenant : vivant, débat du jour à partir du 2e jour, une charge, pas déjà utilisé. */
export function oeilBaobabUsableNow(view: MyGameView): boolean {
  return view.my_alive && view.game.status === 'day_discussion' && view.game.night_number >= 2 && view.my_oeil_baobab_stock > 0 && !view.my_oeil_baobab_result
}

/** Vrai si au moins un artefact peut être activé MAINTENANT depuis ce menu
 * — pilote le petit point rouge sur l'icône (voir PhaseBanner.tsx). */
export function hasUsableArtifact(view: MyGameView): boolean {
  return (!view.my_alive && view.my_owns_parchemin_griot && !view.my_parchemin_griot_used) || oeilBaobabUsableNow(view)
}

/** Contenu du menu "🎒 Mes artefacts" (voir Modal dans GameRoom.tsx) :
 * liste les artefacts "actifs" que le joueur peut déclencher lui-même,
 * quand il le souhaite — plus jamais imposés automatiquement par le
 * système (retour utilisateur : "je peux décider de l'utiliser à
 * n'importe quel moment"). Chaque activation exige DEUX confirmations
 * (voir ParcheminGriotRow ci-dessous) : la première n'arme que le bouton,
 * la seconde déclenche réellement l'appel serveur — un geste définitif
 * (une fois par partie), donc jamais au premier clic. */
export function ArtifactsMenu({ view, gameId }: { view: MyGameView; gameId: string }) {
  const { t } = useLanguage()

  if (!hasArtifactsToShow(view)) {
    return <p className="text-sm text-moon-200/50">{t('artifacts.empty')}</p>
  }

  return (
    <div className="flex flex-col gap-2.5">
      {hasOeilBaobabToShow(view) && <OeilBaobabRow view={view} gameId={gameId} />}
      {!view.my_alive && view.my_owns_parchemin_griot && (
        <ParcheminGriotRow gameId={gameId} used={view.my_parchemin_griot_used} stock={view.my_parchemin_griot_stock} />
      )}
      {!view.my_alive && view.my_owns_dernier_souffle && view.my_dernier_souffle_used && <DernierSouffleRow />}
      <p className="mt-1 text-[11px] leading-relaxed text-moon-200/35">{t('artifacts.footerNote')}</p>
    </div>
  )
}

function ArtifactRow({
  emoji,
  name,
  description,
  badge,
  badgeTone,
  children,
}: {
  emoji: string
  name: string
  description: string
  badge: string
  badgeTone: 'ok' | 'used'
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-night-600/60 bg-night-800/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-xl leading-none">{emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-moon-200">{name}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-moon-200/50">{description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${
            badgeTone === 'ok'
              ? 'border-emerald-700/50 bg-emerald-700/10 text-emerald-400'
              : 'border-night-600 bg-night-800 text-moon-200/40'
          }`}
        >
          {badge}
        </span>
      </div>
      {children}
    </div>
  )
}

/** Parchemin du Griot (migration 0179) : seul artefact "actif" du menu pour
 * l'instant. Deux étapes de confirmation avant le vrai appel RPC — la
 * première ('idle' -> 'armed') se contente d'échanger le bouton "Utiliser"
 * contre "Annuler" / "Confirmer l'utilisation ?", sans rien envoyer au
 * serveur ; seule la seconde ('armed' -> appel RPC) consomme réellement
 * l'artefact. Retour utilisateur explicite : "c'est très important la
 * deuxième confirmation". */
function ParcheminGriotRow({ gameId, used, stock }: { gameId: string; used: boolean; stock: number }) {
  const { t } = useLanguage()
  const [step, setStep] = useState<'idle' | 'armed'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justActivated, setJustActivated] = useState(false)

  const activated = used || justActivated

  async function confirm() {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await gameRpc('use_parchemin_griot', { p_game_id: gameId })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message)
      setStep('idle')
      return
    }
    setJustActivated(true)
  }

  return (
    <ArtifactRow
      emoji="🎭"
      name={t('artifacts.parcheminGriot.name')}
      description={t('artifacts.parcheminGriot.description')}
      badge={activated ? t('artifacts.badge.activated') : t('artifacts.badge.available')}
      badgeTone={activated ? 'used' : 'ok'}
    >
      <p className="mt-1.5 text-[11px] text-moon-200/40">{t('artifacts.stock', { count: stock })}</p>
      {!activated && (
        <div className="mt-2.5 flex gap-2">
          {step === 'idle' ? (
            <Button variant="ghost" className="flex-1 !py-2 !text-xs" onClick={() => setStep('armed')}>
              {t('artifacts.use')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" className="flex-1 !py-2 !text-xs" disabled={loading} onClick={() => setStep('idle')}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1 !py-2 !text-xs" disabled={loading} onClick={confirm}>
                {t('artifacts.confirmUse')}
              </Button>
            </>
          )}
        </div>
      )}
      {(step === 'armed' || activated) && (
        <p className="mt-2 text-[11px] text-moon-400">{t('artifacts.parcheminGriot.confirmNote')}</p>
      )}
      <ErrorText>{error}</ErrorText>
    </ArtifactRow>
  )
}

/** L'Œil du Baobab (migration 0246) : consomme une charge. Trois temps : choisir 3 joueurs, armer (« Consulter »), puis
 * confirmer — comme le Parchemin du Griot, un geste définitif (une fois par partie) ne part jamais au premier clic. Le résultat
 * reste affiché dans la ligne tant que la partie dure (il vient de la vue de partie, donc il survit à un rechargement). */
function OeilBaobabRow({ view, gameId }: { view: MyGameView; gameId: string }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [step, setStep] = useState<'idle' | 'pick' | 'armed'>('idle')
  const [picked, setPicked] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localResult, setLocalResult] = useState<{ targets: string[]; has_wolf: boolean } | null>(null)

  const result = view.my_oeil_baobab_result ?? localResult
  const usable = oeilBaobabUsableNow(view) && !localResult
  // Les 3 joueurs consultés sont toujours d'autres joueurs en vie (le serveur le vérifie aussi).
  const candidates = view.players.filter((p) => p.is_alive && p.user_id !== user?.id)

  function toggle(userId: string) {
    setPicked((cur) => (cur.includes(userId) ? cur.filter((x) => x !== userId) : cur.length < 3 ? [...cur, userId] : cur))
    setStep('pick')
  }

  async function confirm() {
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await gameRpc('use_oeil_baobab', { p_game_id: gameId, p_targets: picked })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message)
      setStep('pick')
      return
    }
    setLocalResult(data as { targets: string[]; has_wolf: boolean })
    setStep('idle')
  }

  const nameOf = (id: string) => view.players.find((p) => p.user_id === id)?.display_name ?? '?'
  const names = (ids: string[]) => ids.map(nameOf).join(', ')

  return (
    <ArtifactRow
      emoji="👁️"
      name={t('artifacts.oeil.name')}
      description={t('artifacts.oeil.description')}
      badge={result ? t('artifacts.badge.used') : usable ? t('artifacts.badge.available') : t('artifacts.stock', { count: view.my_oeil_baobab_stock })}
      badgeTone={usable ? 'ok' : 'used'}
    >
      {result && (
        <p className={`mt-2.5 rounded-lg border px-3 py-2 text-xs leading-relaxed ${result.has_wolf ? 'border-blood-600/50 bg-blood-700/10 text-moon-200' : 'border-emerald-700/50 bg-emerald-700/10 text-moon-200'}`}>
          {t(result.has_wolf ? 'artifacts.oeil.resultWolf' : 'artifacts.oeil.resultNone', { names: names(result.targets) })}
        </p>
      )}
      {!result && !usable && view.my_oeil_baobab_stock > 0 && (
        <p className="mt-2 text-[11px] text-moon-200/40">{t('artifacts.oeil.whenUsable')}</p>
      )}
      {usable && step === 'idle' && (
        <Button variant="ghost" className="mt-2.5 w-full !py-2 !text-xs" onClick={() => setStep('pick')}>
          {t('artifacts.use')}
        </Button>
      )}
      {usable && step !== 'idle' && (
        <div className="mt-2.5 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-moon-300">{t('artifacts.oeil.pick', { count: picked.length })}</p>
          <PlayerGrid
            players={candidates}
            selfId={user?.id}
            selectable
            compact
            highlightIds={picked}
            onSelect={toggle}
            showDeathReveal={false}
          />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1 !py-2 !text-xs" disabled={loading} onClick={() => { setStep('idle'); setPicked([]) }}>
              {t('common.cancel')}
            </Button>
            {step === 'armed' ? (
              <Button className="flex-1 !py-2 !text-xs" disabled={loading} onClick={confirm}>
                {t('artifacts.confirmUse')}
              </Button>
            ) : (
              <Button className="flex-1 !py-2 !text-xs" disabled={picked.length !== 3} onClick={() => setStep('armed')}>
                {t('artifacts.oeil.consult')}
              </Button>
            )}
          </div>
          {step === 'armed' && <p className="text-[11px] text-moon-400">{t('artifacts.oeil.confirmNote')}</p>}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </ArtifactRow>
  )
}

/** Dernier Souffle : simple rappel une fois déjà utilisé (le formulaire
 * d'envoi lui-même — LastWordsForm, GameRoom.tsx — reste la seule façon de
 * l'activer, affiché automatiquement juste après l'élimination ; pas
 * dupliqué ici pour éviter deux façons différentes de faire la même
 * chose). */
function DernierSouffleRow() {
  const { t } = useLanguage()
  return (
    <ArtifactRow
      emoji="🕯️"
      name={t('artifacts.dernierSouffle.name')}
      description={t('artifacts.dernierSouffle.usedDescription')}
      badge={t('artifacts.badge.used')}
      badgeTone="used"
    />
  )
}
