import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'

interface Prefs {
  enabled: boolean
  streak: boolean
  quests: boolean
  games: boolean
  progress: boolean
  comeback: boolean
}

const TYPES: { key: Exclude<keyof Prefs, 'enabled'>; label: TranslationKey; hint: TranslationKey }[] = [
  { key: 'quests', label: 'notifPrefs.quests', hint: 'notifPrefs.questsHint' },
  { key: 'streak', label: 'notifPrefs.streak', hint: 'notifPrefs.streakHint' },
  { key: 'games', label: 'notifPrefs.games', hint: 'notifPrefs.gamesHint' },
  { key: 'progress', label: 'notifPrefs.progress', hint: 'notifPrefs.progressHint' },
  { key: 'comeback', label: 'notifPrefs.comeback', hint: 'notifPrefs.comebackHint' },
]

export function NotificationPreferences() {
  const { t } = useLanguage()
  const [prefs, setPrefs] = useState<Prefs | null>(null)

  useEffect(() => {
    supabase.rpc('get_my_notification_prefs').then(({ data }) => {
      if (data) setPrefs(data as Prefs)
    })
  }, [])

  if (!prefs) return null

  async function update(patch: Partial<Prefs>) {
    const next = { ...prefs!, ...patch }
    setPrefs(next)
    const { error } = await supabase.rpc('save_my_notification_prefs', {
      p_enabled: next.enabled,
      p_streak: next.streak,
      p_quests: next.quests,
      p_games: next.games,
      p_progress: next.progress,
      p_comeback: next.comeback,
    })
    if (error) setPrefs(prefs)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-night-600/50 pt-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-moon-200">{t('notifPrefs.all')}</span>
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="h-4 w-4 accent-amber-400"
        />
      </label>
      {prefs.enabled &&
        TYPES.map((type) => (
          <label key={type.key} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm text-moon-200/90">{t(type.label)}</span>
              <span className="block text-xs text-moon-200/50">{t(type.hint)}</span>
            </span>
            <input
              type="checkbox"
              checked={prefs[type.key]}
              onChange={(e) => update({ [type.key]: e.target.checked })}
              className="mt-1 h-4 w-4 shrink-0 accent-amber-400"
            />
          </label>
        ))}
      {prefs.enabled && <p className="text-xs text-moon-200/40">{t('notifPrefs.limits')}</p>}
    </div>
  )
}
