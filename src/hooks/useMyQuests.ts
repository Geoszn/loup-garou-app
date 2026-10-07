import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cachedRpc } from '../lib/rpcCache'
import { homeSection } from '../lib/homeBootstrap'
import { useAuth } from '../context/AuthContext'

export interface Quest {
  template_id: string
  label_fr: string
  label_en: string
  progress: number
  target: number
  reward_coins: number
  claimed_at: string | null
  /** 'season' pour les quêtes saisonnières (à venir) ; absent = quête du jour. */
  scope?: 'day' | 'season'
}

/** Quêtes du jour du joueur (get_my_quests) et récupération d'une récompense. */
export function useMyQuests() {
  const { user, refreshProfile } = useAuth()
  const [quests, setQuests] = useState<Quest[] | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  // Les appels sans `force` partagent la requête en vol / récente (la barre du
  // bas et l'accueil la demandaient chacune au même instant — voir rpcCache.ts) ;
  // après une réclamation on relit pour de bon.
  const reload = useCallback(async (force = false) => {
    // Première lecture sur l'accueil : section du groupé (homeBootstrap.ts) ;
    // relecture forcée (après une réclamation) : appel direct.
    const data = force
      ? (await cachedRpc<Quest[]>('get_my_quests', undefined, { force: true })).data
      : await homeSection<Quest[]>('quests', async () => (await cachedRpc<Quest[]>('get_my_quests')).data)
    if (data) setQuests(data)
  }, [])

  useEffect(() => {
    if (user) void reload()
  }, [user, reload])

  async function claim(templateId: string) {
    setClaiming(templateId)
    const { data, error } = await supabase.rpc('claim_quest_reward', { p_template_id: templateId })
    setClaiming(null)
    if (!error && data) {
      void refreshProfile()
      await reload(true)
    }
  }

  const claimableCount = quests?.filter((q) => q.progress >= q.target && !q.claimed_at).length ?? 0
  return { quests, claiming, claim, reload, claimableCount }
}
