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
          return (
            <li key={q.template_id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={claimed ? 'text-moon-200/40 line-through' : 'text-moon-200/90'}>{label}</span>
                {claimed ? (
                  <span className="shrink-0 text-xs text-emerald-400" aria-hidden="true">
                    ✓
                  </span>
                ) : done ? (
                  <Button
                    className="shrink-0 px-2.5 py-1 text-[11px]"
                    disabled={claiming === q.template_id}
                    onClick={() => claim(q.template_id)}
                  >
                    {claiming === q.template_id ? t('common.sending') : t('quest.claim', { points: q.reward_points })}
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-moon-200/40">
                    {q.progress}/{q.target}
                  </span>
                )}
              </div>
              {!claimed && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-night-800">
                  <div
                    className="h-full rounded-full bg-moon-300 transition-all"
                    style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
