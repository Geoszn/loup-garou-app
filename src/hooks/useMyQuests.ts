import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export interface Quest {
  template_id: string
  label_fr: string
  label_en: string
  progress: number
  target: number
  reward_coins: number
  claimed_at: string | null
}

/** Quêtes du jour du joueur (get_my_quests) et récupération d'une récompense. */
export function useMyQuests() {
  const { user, refreshProfile } = useAuth()
  const [quests, setQuests] = useState<Quest[] | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_quests')
    if (data) setQuests(data as Quest[])
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
      await reload()
    }
  }

  const claimableCount = quests?.filter((q) => q.progress >= q.target && !q.claimed_at).length ?? 0
  return { quests, claiming, claim, reload, claimableCount }
}
