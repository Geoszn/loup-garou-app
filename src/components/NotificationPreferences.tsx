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

type Category = 'enabled' | 'streak' | 'quests' | 'games' | 'progress' | 'comeback'

// Trois familles plutôt que cinq réglages : chacune pilote une ou deux
// catégories côté serveur (voir pick_engagement_notifications, migration 0189).
const GROUPS: { keys: Exclude<Category, 'enabled'>[]; label: TranslationKey; hint: TranslationKey }[] = [
  { keys: ['quests', 'streak'], label: 'notifPrefs.groupQuests', hint: 'notifPrefs.groupQuestsHint' },
  { keys: ['games'], label: 'notifPrefs.groupGames', hint: 'notifPrefs.groupGamesHint' },
  { keys: ['progress', 'comeback'], label: 'notifPrefs.groupProgress', hint: 'notifPrefs.groupProgressHint' },
]

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-moon-400/60 ${
        checked ? 'border-moon-400 bg-moon-400/80' : 'border-night-500 bg-night-800'
      }`}
    >
      <span
        className={`absolute top-0.5 rounded-full transition-all ${checked ? 'left-[1.375rem] bg-night-950' : 'left-0.5 bg-moon-200/60'}`}
        style={{ height: '1.125rem', width: '1.125rem' }}
      />
    </button>
  )
}

export function NotificationPreferences() {
  const { t } = useLanguage()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    supabase.rpc('get_my_notification_prefs').then(({ data }) => {
      if (data) setPrefs(data as Prefs)
    })
  }, [])

  if (!prefs) return null

  async function update(patch: Partial<Prefs>) {
    const previous = prefs!
    const next = { ...previous, ...patch }
    setPrefs(next)
    const { error } = await supabase.rpc('save_my_notification_prefs', {
      p_enabled: next.enabled,
      p_streak: next.streak,
      p_quests: next.quests,
      p_games: next.games,
      p_progress: next.progress,
      p_comeback: next.comeback,
    })
    if (error) setPrefs(previous)
  }

  return (
    <div className="flex flex-col gap-3 border-t border-night-600/50 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-moon-200">{t('notifPrefs.all')}</p>
          <p className="text-xs text-moon-200/50">{t('notifPrefs.limits')}</p>
        </div>
        <Switch checked={prefs.enabled} onChange={(v) => update({ enabled: v })} label={t('notifPrefs.all')} />
      </div>

      {prefs.enabled && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="self-start text-xs font-semibold text-moon-300 underline underline-offset-4 transition-colors hover:text-moon-200"
          >
            {t('notifPrefs.customize')} {open ? '⌃' : '⌄'}
          </button>
          {open && (
            <div className="flex flex-col gap-3 rounded-xl border border-night-600/60 bg-night-900/40 px-3 py-3">
              {GROUPS.map((group) => (
                <div key={group.label} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-moon-200/90">{t(group.label)}</p>
                    <p className="text-xs text-moon-200/50">{t(group.hint)}</p>
                  </div>
                  <Switch
                    checked={group.keys.some((k) => prefs[k])}
                    onChange={(v) => update(Object.fromEntries(group.keys.map((k) => [k, v])) as Partial<Prefs>)}
                    label={t(group.label)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
