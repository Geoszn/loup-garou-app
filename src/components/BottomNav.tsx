import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from './Avatar'
import { useMyAvatarConfig } from './AvatarEditor'

const itemBase = 'relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="absolute right-[22%] top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blood-600 px-1 text-[10px] font-bold leading-none text-[#fdf6e3]">
      {count}
    </span>
  )
}

/** Barre de navigation fixe, dans la zone du pouce : Accueil, Récompenses,
 * Jouer (bouton central), Amis, Profil. Chaque entrée est une page à part
 * entière. */
export function BottomNav({ pendingFriendCount = 0, claimable = false }: { pendingFriendCount?: number; claimable?: boolean }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const myAvatar = useMyAvatarConfig()

  const cls = ({ isActive }: { isActive: boolean }) => `${itemBase} ${isActive ? 'text-moon-300' : 'text-moon-200/50 hover:text-moon-200'}`

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-night-600/70 bg-night-900/95 shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.55)]"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.25rem)' }}
    >
      <div className="mx-auto flex max-w-3xl items-end px-2">
        <NavLink to="/dashboard" className={cls}>
          <Icon>
            <path d="M4 11l8-7 8 7" />
            <path d="M6 10v9h12v-9" />
          </Icon>
          {t('nav.home')}
        </NavLink>

        <NavLink to="/recompenses" className={cls}>
          <Icon>
            <rect x="4" y="9" width="16" height="11" rx="1.5" />
            <path d="M12 9v11M3 9h18M12 9c-2.5 0-4.5-1-4.5-2.8S9.5 4 12 9c2.5-5 4.5-3.8 4.5-2.8S14.5 9 12 9z" />
          </Icon>
          {t('nav.rewards')}
          {claimable && <span className="absolute right-[26%] top-1 h-2 w-2 rounded-full bg-blood-400" />}
        </NavLink>

        <div className="flex flex-1 justify-center">
          <NavLink to="/jouer" aria-label={t('nav.play')} className="-mt-5 flex flex-col items-center gap-0.5 text-[10px] font-semibold text-moon-300">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-night-900 bg-gradient-to-b from-blood-500 to-blood-700 text-[#fdf6e3] shadow-blood-btn transition-transform active:scale-95">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" />
              </svg>
            </span>
            {t('nav.play')}
          </NavLink>
        </div>

        <NavLink to="/amis" className={cls}>
          <Icon>
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
            <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.6 2.8 2.2 3.2 4.6" />
          </Icon>
          {t('nav.friends')}
          <Badge count={pendingFriendCount} />
        </NavLink>

        <NavLink to="/profil" className={cls}>
          <Avatar config={myAvatar.config} icon={profile?.avatar_icon} name={profile?.username} className="h-6 w-6 ring-1 ring-night-600" />
          {t('nav.profile')}
        </NavLink>
      </div>
    </nav>
  )
}
