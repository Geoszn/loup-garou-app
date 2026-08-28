import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Button } from './ui'

interface RewardResult {
  points_awarded: number
  already_claimed: boolean
  new_rank_points: number
}

type State = 'idle' | 'opening' | 'revealed'

/**
 * Coffre de fin de partie (migration 0111) : bonus de points aléatoire,
 * indépendant du résultat de la partie — gagné ou perdu, tout le monde peut
 * l'ouvrir. Volontairement une action explicite (bouton à presser) plutôt
 * qu'un tirage automatique à l'affichage de EndScreen : l'appui fait partie
 * de la mécanique de récompense variable (comme tirer un levier), pas juste
 * un détail d'UX.
 *
 * claim_end_of_game_reward est idempotente — si le joueur recharge la page
 * en plein milieu de EndScreen et rouvre, le serveur renvoie le montant déjà
 * tiré (already_claimed: true) plutôt qu'un second tirage : ce composant
 * saute alors directement l'animation d'ouverture pour l'afficher.
 */
export function RewardChest({ gameId }: { gameId: string }) {
  const { refreshProfile } = useAuth()
  const { t } = useLanguage()
  const [state, setState] = useState<State>('idle')
  const [result, setResult] = useState<RewardResult | null>(null)

  async function open() {
    setState('opening')
    const { data, error } = await supabase.rpc('claim_end_of_game_reward', { p_game_id: gameId })
    if (error || !data) {
      setState('idle')
      return
    }
    const r = data as RewardResult
    // Un tirage frais mérite le suspense de l'animation d'ouverture ; un
    // montant déjà connu (rechargement de page) est affiché tout de suite.
    const delay = r.already_claimed ? 0 : 700
    window.setTimeout(() => {
      setResult(r)
      setState('revealed')
      if (!r.already_claimed && r.points_awarded > 0) refreshProfile()
    }, delay)
  }

  return (
    <div className="mx-auto mb-5 max-w-sm animate-fade-in rounded-2xl border border-night-600/60 bg-night-900/50 p-4 text-center">
      <p className="mb-1 text-xs uppercase tracking-widest text-moon-200/40">{t('reward.title')}</p>

      {state !== 'revealed' && <p className="mb-3 text-xs text-moon-200/50">{t('reward.subtitle')}</p>}

      <AnimatePresence mode="wait">
        {state === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-3 text-4xl" aria-hidden="true">
              🎁
            </div>
            <Button onClick={open} className="w-full">
              {t('reward.open')}
            </Button>
          </motion.div>
        )}

        {state === 'opening' && (
          <motion.div
            key="opening"
            className="mb-1 text-4xl"
            aria-hidden="true"
            animate={{ rotate: [0, -8, 8, -8, 8, 0], scale: [1, 1.08, 1.08, 1.08, 1.08, 1] }}
            transition={{ duration: 0.7 }}
          >
            🎁
          </motion.div>
        )}

        {state === 'revealed' && result && (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            {result.points_awarded > 0 ? (
              <>
                <div className="mb-1 text-4xl" aria-hidden="true">
                  ✨
                </div>
                <p className="font-display text-xl font-bold text-moon-300">
                  {t('reward.won', { points: result.points_awarded })}
                </p>
              </>
            ) : (
              <>
                <div className="mb-1 text-4xl opacity-60" aria-hidden="true">
                  📦
                </div>
                <p className="text-sm text-moon-200/60">{t('reward.empty')}</p>
              </>
            )}
            {result.already_claimed && (
              <p className="mt-1.5 text-[11px] text-moon-200/35">{t('reward.alreadyClaimed')}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
