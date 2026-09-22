import { useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Button, ErrorText } from './ui'
import { useLanguage } from '../i18n/LanguageContext'
import type { MyGameView } from '../types/game'

/** Vrai si le menu "🎒 Mes artefacts" a quelque chose à montrer pour ce
 * joueur — sert à la fois à savoir si l'icône doit apparaître dans
 * PhaseBanner et si un point rouge doit la signaler comme "à consulter"
 * (voir GameRoom.tsx). Un seul artefact "actif" existe pour l'instant
 * (Parchemin du Griot, migration 0179) ; Dernier Souffle n'apparaît ici
 * qu'une fois déjà utilisé, en simple rappel (le formulaire d'envoi
 * lui-même reste affiché ailleurs sur l'écran fantôme, pas dans ce menu). */
export function hasArtifactsToShow(view: MyGameView): boolean {
  return view.my_owns_parchemin_griot || (view.my_owns_dernier_souffle && view.my_dernier_souffle_used)
}

/** Vrai si au moins un artefact peut être activé MAINTENANT depuis ce menu
 * — pilote le petit point rouge sur l'icône (voir PhaseBanner.tsx). */
export function hasUsableArtifact(view: MyGameView): boolean {
  return view.my_owns_parchemin_griot && !view.my_parchemin_griot_used
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
      {view.my_owns_parchemin_griot && (
        <ParcheminGriotRow gameId={gameId} used={view.my_parchemin_griot_used} />
      )}
      {view.my_owns_dernier_souffle && view.my_dernier_souffle_used && <DernierSouffleRow />}
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
function ParcheminGriotRow({ gameId, used }: { gameId: string; used: boolean }) {
  const { t } = useLanguage()
  const [step, setStep] = useState<'idle' | 'armed'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justActivated, setJustActivated] = useState(false)

  const activated = used || justActivated

  async function confirm() {
    setLoading(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('use_parchemin_griot', { p_game_id: gameId })
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
