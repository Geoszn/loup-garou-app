import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from '../components/Avatar'
import { RankBadge } from '../components/RankBadge'
import { RankProgress } from '../components/RankProgress'
import { FeedbackButton } from '../components/FeedbackButton'
import { ProfileEditor } from '../components/ProfileEditor'
import { notifyAvatarChanged, useMyAvatarConfig } from '../components/AvatarEditor'

const box = 'rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 shadow-card'

function Row({ to, icon, label, hint }: { to: string; icon: string; label: string; hint?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 text-moon-200/90 transition-colors hover:bg-night-700/40">
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-moon-200/45">{hint}</span>}
      </span>
      <span className="text-moon-200/30" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-night-600/60 bg-night-900/40 p-3 text-center">
      <p className="font-display text-xl text-moon-200">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-moon-200/50">{label}</p>
    </div>
  )
}

/** Page « Profil » : ton avatar, ta progression, quelques chiffres et le menu
 * personnel (statistiques, compte, aide, avis, déconnexion). */
export default function Profile() {
  const { profile, signOut } = useAuth()
  const { t } = useLanguage()
  const myAvatar = useMyAvatarConfig()
  const [editorOpen, setEditorOpen] = useState(false)
  const [stats, setStats] = useState<{ games_played: number; games_won: number } | null>(null)

  useEffect(() => {
    supabase.rpc('get_my_stats').then(({ data, error }) => {
      if (!error && data) setStats(data as { games_played: number; games_won: number })
    })
  }, [])

  return (
    <div className="min-h-screen px-4 pt-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header>
          <h1 className="font-display text-2xl text-moon-200">{t('nav.profile')}</h1>
        </header>

        <div className={`${box} flex flex-col items-center gap-3 p-5 text-center`}>
          <div className="relative">
            <Avatar config={myAvatar.config} icon={profile?.avatar_icon} name={profile?.username} className="h-24 w-24 ring-2 ring-moon-400/60 ring-offset-4 ring-offset-night-900" />
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              aria-label={t('profile.editAvatar')}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-night-900 bg-blood-600 text-sm text-[#fdf6e3]"
            >
              ✎
            </button>
          </div>
          <div>
            <p className="font-display text-xl text-moon-200">{profile?.username}</p>
            {profile && (
              <div className="mt-1 flex justify-center">
                <RankBadge points={profile.rank_points} streak={profile.current_streak} />
              </div>
            )}
          </div>
          <RankProgress points={profile?.rank_points ?? 0} />
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="rounded-xl border border-night-500 bg-gradient-to-b from-night-700/70 to-night-800/50 px-4 py-2 text-xs font-semibold text-moon-200"
          >
            {t('profile.editAvatar')}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label={t('profile.games')} value={stats?.games_played ?? '—'} />
          <Stat label={t('profile.wins')} value={stats?.games_won ?? '—'} />
          <Stat label={t('profile.bestStreak')} value={profile?.best_streak ?? '—'} />
        </div>

        <div className={`${box} divide-y divide-night-700/60 overflow-hidden`}>
          <Row to="/stats" icon="📊" label={t('accountMenu.stats')} hint={t('profile.statsHint')} />
          <Row to="/compte" icon="⚙️" label={t('accountMenu.myAccount')} hint={t('profile.accountHint')} />
          <Row to="/aide" icon="❓" label={t('accountMenu.help')} hint={t('profile.helpHint')} />
          <div className="flex items-center gap-3 px-4 py-3.5 text-sm text-moon-200/90">
            <span className="text-lg" aria-hidden="true">
              💬
            </span>
            <FeedbackButton />
          </div>
        </div>

        <button
          type="button"
          onClick={() => signOut()}
          className={`${box} flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-blood-400 transition-colors hover:bg-blood-700/10`}
        >
          {t('accountMenu.signOut')}
        </button>
      </div>

      <ProfileEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        profile={profile}
        avatar={myAvatar.config}
        onSaved={() => {
          notifyAvatarChanged()
          setTimeout(() => setEditorOpen(false), 1200)
        }}
      />
    </div>
  )
}
