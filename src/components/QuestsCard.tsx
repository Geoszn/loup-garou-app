import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Button } from './ui'

interface Quest {
  template_id: string
  label_fr: string
  label_en: string
  progress: number
  target: number
  reward_points: number
  claimed_at: string | null
}

/**
 * 3 quêtes assignées au hasard chaque jour, parmi un catalogue géré depuis
 * l'onglet "Quêtes" du dashboard admin (voir migration 0112,
 * quest_templates — plus de catalogue en dur côté client : label_fr/
 * label_en/target/reward_points viennent directement de get_my_quests).
 * La progression avance côté serveur à la fin de chaque partie
 * (sync_daily_quests_for_game, appelée depuis EndScreen), ce composant ne
 * fait qu'afficher l'état courant et permettre de réclamer la récompense
 * d'une quête terminée. Invisible tant que get_my_quests n'a pas répondu,
 * pour ne jamais montrer une carte vide qui se remplit après coup.
 */
export function QuestsCard() {
  const { refreshProfile } = useAuth()
  const { t, lang } = useLanguage()
  const [quests, setQuests] = useState<Quest[] | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.rpc('get_my_quests')
    if (data) setQuests(data as Quest[])
  }

  useEffect(() => {
    load()
  }, [])

  async function claim(templateId: string) {
    setClaiming(templateId)
    const { data, error } = await supabase.rpc('claim_quest_reward', { p_template_id: templateId })
    setClaiming(null)
    if (!error && data) {
      refreshProfile()
      await load()
    }
  }

  if (!quests || quests.length === 0) return null

  return (
    <div className="rounded-2xl border border-night-600/60 bg-night-900/40 px-4 py-3.5">
      <p className="mb-3 text-xs uppercase tracking-widest text-moon-200/40">{t('quest.title')}</p>
      <ul className="flex flex-col gap-3">
        {quests.map((q) => {
          const done = q.progress >= q.target
          const claimed = !!q.claimed_at
          const label = lang === 'en' ? q.label_en : q.label_fr
          // Segments individuels (une case par palier) plutôt qu'une barre
          // continue : retour utilisateur — "un visuel bien clair et
          // progressif qui montre l'évolution de la quête". Les objectifs
          // restent petits (voir quest_templates, catalogue admin), donc un
          // segment par étape reste lisible ; repli sur une barre continue
          // au-delà d'un certain nombre pour ne jamais tasser l'affichage.
          const segments = q.target > 0 && q.target <= 12 ? q.target : null

          return (
            <li
              key={q.template_id}
              className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
                claimed
                  ? 'border-night-700/40 bg-night-800/20'
                  : done
                    ? 'border-amber-400/40 bg-amber-400/[0.06]'
                    : 'border-night-700/50 bg-night-800/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {/* La récompense passe devant le libellé (retour utilisateur
                    — "met devant la récompense attendue") : jusqu'ici elle
                    n'apparaissait que sur le bouton "Réclamer", une fois la
                    quête déjà terminée — impossible de savoir si ça valait
                    le coup avant de s'y mettre. */}
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                    claimed ? 'bg-night-700/50 text-moon-200/40' : 'bg-amber-400/15 text-amber-300'
                  }`}
                >
                  🏆 +{q.reward_points}
                </span>
                <span className={`min-w-0 flex-1 text-sm ${claimed ? 'text-moon-200/40 line-through' : 'text-moon-200/90'}`}>
                  {label}
                </span>
                {claimed && (
                  <span className="shrink-0 text-sm text-emerald-400" aria-hidden="true">
                    ✓
                  </span>
                )}
              </div>

              {!claimed && !done && (
                <div className="flex items-center gap-2.5">
                  {segments ? (
                    <div className="flex flex-1 gap-1">
                      {Array.from({ length: segments }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-2 flex-1 rounded-full transition-colors ${
                            i < q.progress ? 'bg-moon-300' : 'bg-night-700'
                          }`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-night-800">
                      <div
                        className="h-full rounded-full bg-moon-300 transition-all"
                        style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                      />
                    </div>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-moon-200/50">
                    {q.progress}/{q.target}
                  </span>
                </div>
              )}

              {done && !claimed && (
                <Button className="w-full py-2 text-sm" disabled={claiming === q.template_id} onClick={() => claim(q.template_id)}>
                  {claiming === q.template_id ? t('common.sending') : t('quest.claim', { points: q.reward_points })}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
