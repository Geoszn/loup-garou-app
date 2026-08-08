import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AvatarIcon } from './AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'

/** Un seul point d'entrée "compte" (avatar + pseudo) qui déroule un menu
 * vers Aide / Mon compte / Statistiques / Amis / Déconnexion, à la place d'une
 * rangée de plusieurs icônes séparées dans l'en-tête — moins encombré, et le
 * badge de demandes d'ami en attente reste visible qu'on l'ouvre ou non.
 * "Aide" est placé avant "Mon compte" à la demande explicite : c'est le
 * premier élément qu'on croise en déroulant le menu, avant les réglages. */
export function AccountMenu({
  username,
  avatarIcon,
  pendingFriendCount,
  onSignOut,
}: {
  username?: string
  avatarIcon?: string | null
  pendingFriendCount: number
  onSignOut: () => void
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-1.5 rounded-full border border-night-600 bg-night-800/60 py-1 pl-1 pr-2 text-xs text-moon-200/80 transition-colors hover:border-moon-400/50 hover:text-moon-200 sm:gap-2 sm:py-1.5 sm:pl-1.5 sm:pr-3 sm:text-sm"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-night-700 text-sm sm:h-7 sm:w-7">
          <AvatarIcon icon={avatarIcon} className="h-4 w-4" />
        </span>
        <span className="max-w-[64px] truncate sm:max-w-[110px]">{username}</span>
        <span className="text-[9px] text-moon-200/40">{open ? '▲' : '▼'}</span>
        {pendingFriendCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blood-600 text-[10px] font-bold text-[#fdf6e3]">
            {pendingFriendCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-xl border border-night-600 bg-night-800 p-1.5 shadow-card">
          <MenuLink to="/aide" onNavigate={() => setOpen(false)} icon="❓" label={t('accountMenu.help')} />
          <MenuLink to="/compte" onNavigate={() => setOpen(false)} icon="⚙️" label={t('accountMenu.myAccount')} />
          <MenuLink to="/stats" onNavigate={() => setOpen(false)} icon="📊" label={t('accountMenu.stats')} />
          <MenuLink
            to="/amis"
            onNavigate={() => setOpen(false)}
            icon="👥"
            label={t('accountMenu.friends')}
            badge={pendingFriendCount > 0 ? pendingFriendCount : undefined}
          />
          <div className="my-1 border-t border-night-700" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-blood-400 transition-colors hover:bg-blood-700/10"
          >
            {t('accountMenu.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({
  to,
  icon,
  label,
  badge,
  onNavigate,
}: {
  to: string
  icon: string
  label: string
  badge?: number
  onNavigate: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-moon-200/80 transition-colors hover:bg-night-700/60 hover:text-moon-200"
    >
      <span className="flex items-center gap-2">
        <span>{icon}</span> {label}
      </span>
      {badge ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blood-600 px-1 text-[10px] font-bold text-[#fdf6e3]">
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
