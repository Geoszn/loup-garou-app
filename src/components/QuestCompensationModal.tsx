import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { LoupCoinIcon } from './LoupCoinIcon'

interface Compensation {
  amount: number
  quests_count: number
}

export function QuestCompensationModal() {
  const { user, refreshProfile } = useAuth()
  const { t } = useLanguage()
  const [comp, setComp] = useState<Compensation | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.rpc('get_my_quest_compensation').then(({ data }) => {
      if (data) setComp(data as Compensation)
    })
  }, [user])

  if (!comp) return null

  async function claim() {
    setBusy(true)
    const { error } = await supabase.rpc('claim_quest_compensation')
    setBusy(false)
    if (!error) {
      refreshProfile()
      setComp(null)
    }
  }

  async function dismiss() {
    setBusy(true)
    await supabase.rpc('dismiss_quest_compensation')
    setBusy(false)
    setComp(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-full max-w-sm animate-modal-in flex-col items-center gap-4 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 px-6 py-6 text-center shadow-card"
      >
        <h2 className="font-display text-xl text-moon-100">{t('questComp.title')}</h2>
        <p className="text-sm text-moon-200/80">{t('questComp.body')}</p>
        <div className="flex items-center gap-2 text-2xl font-semibold text-amber-300">
          <LoupCoinIcon className="h-7 w-7" />
          <span>+{comp.amount}</span>
        </div>
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={claim}
            className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-night-900 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {t('questComp.claim')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={dismiss}
            className="rounded-xl px-4 py-2 text-sm text-moon-200/60 transition hover:text-moon-100 disabled:opacity-50"
          >
            {t('questComp.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
