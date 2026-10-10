import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from './Avatar'
import { useMyAvatarConfig } from './AvatarEditor'
import { ConfirmDialog } from './ui'

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

/** Vrai quand un clavier virtuel est ouvert : un champ de texte a le focus et la zone visible a rétréci. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let baseline = Math.max(window.innerHeight, vv.height)
    const typing = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)
    }
    const update = () => {
      if (!typing()) baseline = Math.max(window.innerHeight, vv.height)
      setOpen(typing() && vv.height < baseline - 120)
    }
    update()
    vv.addEventListener('resize', update)
    window.addEventListener('focusin', update)
    window.addEventListener('focusout', update)
    window.addEventListener('orientationchange', () => (baseline = 0))
    return () => {
      vv.removeEventListener('resize', update)
      window.removeEventListener('focusin', update)
      window.removeEventListener('focusout', update)
    }
  }, [])
  return open
}

/** Barre de navigation fixe, dans la zone du pouce : Accueil, Récompenses,
 * Jouer (bouton central), Tribu (les amis y sont un onglet secondaire), Profil. Chaque entrée est une page à part
 * entière. */
export function BottomNav({ alertCount = 0, claimable = false }: { alertCount?: number; claimable?: boolean }) {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const myAvatar = useMyAvatarConfig()

  const keyboardOpen = useKeyboardOpen()
  const navRef = useRef<HTMLElement>(null)

  // La barre publie sa hauteur (--nav-h) : les pages qui doivent la contourner (barre d'action du salon,
  // chat de la partie, hauteur minimale des écrans) s'en servent au lieu de supposer une taille.
  useEffect(() => {
    const root = document.documentElement
    const el = navRef.current
    if (!el || keyboardOpen) {
      root.style.setProperty('--nav-h', '0px')
      root.style.setProperty('--safe-mult', '1')
      return
    }
    const publish = () => {
      root.style.setProperty('--nav-h', `${el.offsetHeight}px`)
      // La zone de sécurité du bas est déjà absorbée par la barre : les éléments posés au-dessus ne la comptent plus.
      root.style.setProperty('--safe-mult', '0')
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.setProperty('--nav-h', '0px')
      root.style.setProperty('--safe-mult', '1')
    }
  }, [keyboardOpen])

  const location = useLocation()
  const navigate = useNavigate()
  // Dans le salon ou une partie, toucher la barre quitte l'écran de jeu : on demande confirmation
  // (la partie continue sans toi, tu la retrouves avec « Reprendre » sur l'accueil).
  const inGame = location.pathname.startsWith('/partie/')
  const [leaveTo, setLeaveTo] = useState<string | null>(null)
  const guard = (to: string) => (e: MouseEvent) => {
    if (!inGame) return
    e.preventDefault()
    setLeaveTo(to)
  }

  const cls = ({ isActive }: { isActive: boolean }) => `${itemBase} ${isActive ? 'text-moon-300' : 'text-moon-200/50 hover:text-moon-200'}`

  if (keyboardOpen) return null

  return (
    <>
    <nav
      ref={navRef}
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-night-600/70 bg-night-900/95 shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.55)]"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.25rem)' }}
    >
      <div className="mx-auto flex max-w-3xl items-end px-2">
        <NavLink to="/dashboard" className={cls} onClick={guard('/dashboard')}>
          <Icon>
            <path d="M4 11l8-7 8 7" />
            <path d="M6 10v9h12v-9" />
          </Icon>
          {t('nav.home')}
        </NavLink>

        <NavLink to="/recompenses" className={cls} onClick={guard('/recompenses')}>
          <Icon>
            <rect x="4" y="9" width="16" height="11" rx="1.5" />
            <path d="M12 9v11M3 9h18M12 9c-2.5 0-4.5-1-4.5-2.8S9.5 4 12 9c2.5-5 4.5-3.8 4.5-2.8S14.5 9 12 9z" />
          </Icon>
          {t('nav.rewards')}
          {claimable && <span className="absolute right-[26%] top-1 h-2 w-2 rounded-full bg-blood-400" />}
        </NavLink>

        <div className="flex flex-1 justify-center">
          <NavLink to="/jouer" onClick={guard('/jouer')} aria-label={t('nav.play')} className="-mt-5 flex flex-col items-center gap-0.5 text-[10px] font-semibold text-moon-300">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-night-900 bg-gradient-to-b from-blood-500 to-blood-700 text-[#fdf6e3] shadow-blood-btn transition-transform active:scale-95">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" />
              </svg>
            </span>
            {t('nav.play')}
          </NavLink>
        </div>

        <NavLink to="/tribu" className={cls} onClick={guard('/tribu')}>
          <Icon>
            <path d="M12 3l7 2.5v6c0 4.5-3 7.6-7 9.5-4-1.9-7-5-7-9.5v-6z" />
            <path d="M12 8.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" />
          </Icon>
          {t('nav.tribe')}
          <Badge count={alertCount} />
        </NavLink>

        <NavLink to="/profil" className={cls} onClick={guard('/profil')}>
          <Avatar config={myAvatar.config} icon={profile?.avatar_icon} name={profile?.username} className="h-6 w-6 ring-1 ring-night-600" />
          {t('nav.profile')}
        </NavLink>
      </div>
    </nav>
      <ConfirmDialog
        open={leaveTo !== null}
        title={t('nav.leaveGame.title')}
        message={t('nav.leaveGame.message')}
        confirmLabel={t('nav.leaveGame.confirm')}
        cancelLabel={t('nav.leaveGame.stay')}
        onConfirm={() => {
          const to = leaveTo
          setLeaveTo(null)
          if (to) navigate(to)
        }}
        onCancel={() => setLeaveTo(null)}
      />
    </>
  )
}
