import { useEffect } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'

type ButtonVariant = 'primary' | 'ghost' | 'danger'

// Partagées entre <Button> et <LinkButton> pour qu'un bouton et un lien
// stylés en bouton soient visuellement identiques au pixel près.
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-semibold tracking-wide transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-moon-400/60 sm:px-5 sm:py-3 sm:text-sm'
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Le bouton primaire garde un fond rouge fixe (non lié au thème
  // jour/nuit) : son texte doit donc rester clair en permanence plutôt que
  // de suivre moon-200, qui devient sombre en pleine journée.
  primary:
    'bg-gradient-to-b from-blood-500 to-blood-700 text-[#fdf6e3] shadow-blood-btn hover:from-blood-400 hover:to-blood-600 active:translate-y-px active:shadow-none',
  ghost:
    'bg-gradient-to-b from-night-700/70 to-night-800/50 text-moon-200 border border-night-500 shadow-[0_1px_0_0_rgb(var(--c-shadow-hairline)/var(--c-shadow-hairline-a))_inset] hover:from-night-600/70 hover:to-night-700/60 active:translate-y-px',
  danger:
    'bg-night-800 text-blood-400 border border-blood-700 hover:bg-blood-700/20 active:translate-y-px',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

/** Un lien de navigation (react-router) stylé exactement comme <Button>,
 * mais rendu comme un unique <a> — jamais un <button> imbriqué dans un <a>.
 * Cette imbrication (qu'on avait avant sur les CTA de la page d'accueil)
 * est invalide en HTML et perturbe le rôle accessible exposé par le
 * navigateur ("lien" vs "bouton" selon le navigateur/lecteur d'écran). */
export function LinkButton({
  variant = 'primary',
  className = '',
  children,
  ...props
}: LinkProps & { variant?: ButtonVariant }) {
  return (
    <Link className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </Link>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      onFocus={(e) => {
        props.onFocus?.(e)
        // Sur mobile, le clavier virtuel peut couvrir le champ qui vient
        // d'être focalisé — surtout sur les formulaires centrés verticalement
        // (connexion, inscription, etc.) où le document n'a pas besoin de
        // défiler pour "tenir" à l'écran, donc le navigateur ne le fait pas
        // tout seul. Un scrollIntoView explicite règle ça quel que soit le
        // support de interactive-widget=resizes-content (voir index.html) ;
        // le petit délai laisse le clavier commencer à s'ouvrir avant de
        // recalculer la position. Un seul endroit (ce composant partagé) sert
        // toutes les pages avec formulaire (connexion, inscription, mot de
        // passe, profil, amis...).
        const el = e.currentTarget
        setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
      }}
      className={`w-full rounded-xl border border-night-500 bg-night-800/80 px-4 py-3 text-moon-200 placeholder:text-moon-200/30 outline-none transition focus:border-moon-400/60 focus:ring-2 focus:ring-moon-400/20 ${props.className ?? ''}`}
    />
  )
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  // Optionnel — quand fourni (voir la liste d'utilisateurs cliquable du
  // dashboard admin), la carte devient un déclencheur d'action ; les
  // dizaines d'usages existants qui ne le passent pas ne changent pas de
  // comportement.
  onClick?: () => void
}) {
  return (
    <div
      // Fond en dégradé (plutôt qu'un aplat) + ombre à trois couches
      // (liseré clair + contact + halo large, voir .shadow-card dans
      // index.css) : c'est ce combo qui donne du relief à la carte au lieu
      // d'un simple rectangle bordé.
      className={`rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/60 to-night-900/70 p-6 shadow-card backdrop-blur-sm ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/** Barre d'action fixée en bas de l'écran (façon appli mobile), pour l'action
 * principale d'une page plutôt que de la laisser perdue en bas d'une longue
 * colonne qu'il faut faire défiler jusqu'au bout. Le conteneur scrollable
 * parent doit réserver un padding-bottom au moins égal à sa hauteur (voir
 * son utilisation dans Lobby.tsx / GameRoom.tsx) pour que le dernier élément
 * de la page ne se retrouve pas caché derrière. */
export function BottomActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-night-700/60 bg-night-900/85 px-4 pt-3 shadow-[0_-8px_24px_-4px_rgba(0,0,0,0.5)] backdrop-blur-md sm:px-6" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  )
}

/** Tiroir latéral (glisse depuis la droite), pour les réglages secondaires
 * qu'on ne veut pas laisser encombrer le flux principal d'une page (ex. les
 * réglages de l'hôte dans Lobby.tsx) tout en restant facile à ouvrir/fermer
 * aussi bien au clavier/souris qu'au doigt. Plein écran sur mobile (plus
 * simple à viser qu'un petit panneau étroit), largeur fixe raisonnable sur
 * desktop. Se ferme au clic sur le fond, sur la croix, ou via Échap. */
export function SideDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const { t } = useLanguage()
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex animate-overlay-in justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm animate-drawer-in flex-col overflow-y-auto scrollbar-thin border-l border-night-600/70 bg-gradient-to-b from-night-800/98 to-night-900/98 p-5 shadow-card sm:max-w-md sm:p-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-moon-200">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-moon-200/50 transition-colors hover:bg-night-700/60 hover:text-moon-200"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Petit sélecteur à onglets (pilule), utilisé pour découper une phase de
 * jeu en sous-écrans (ex. "Village" / "Discuter") au lieu d'empiler tout le
 * contenu verticalement — moins de scroll, plus facile à comprendre d'un
 * coup d'œil. */
export function Segmented<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-night-600/60 bg-night-900/40 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
            active === t.id ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/60 hover:text-moon-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-moon-200/50">
      {children}
    </label>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-lg border border-blood-700/60 bg-blood-700/10 px-3 py-2 text-sm text-blood-400">{children}</p>
}

export function SuccessText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="rounded-lg border border-emerald-700/50 bg-emerald-700/10 px-3 py-2 text-sm text-emerald-400">{children}</p>
  )
}

/** Petite boîte de dialogue de confirmation, pour les actions qu'on ne veut
 * pas déclencher par un simple clic accidentel (quitter une partie en
 * cours, où le personnage meurt réellement). Rendue en overlay plein écran
 * ; comme les couleurs night et moon sont pilotées par variables CSS, elle
 * suit automatiquement le thème jour/nuit de la page qui l'affiche. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useLanguage()
  if (!open) return null
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm')
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')
  return (
    <div
      className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-modal-in rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 p-6 shadow-card"
      >
        <h3 id="confirm-dialog-title" className="mb-2 font-display text-lg text-moon-200">
          {title}
        </h3>
        <p className="mb-6 text-sm text-moon-200/70">{message}</p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            {resolvedCancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Pop-up générique centrée (contenu libre), pour les petits parcours en
 * plusieurs étapes qu'on ne veut pas dérouler en pleine page (ex. choix
 * privé/public à la création d'une partie, choix recherche/code pour
 * rejoindre — voir Dashboard.tsx). Même habillage que ConfirmDialog, mais
 * sans le duo confirmer/annuler imposé : c'est l'appelant qui fournit tout
 * le contenu, boutons compris. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const { t } = useLanguage()
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-sm animate-modal-in overflow-y-auto scrollbar-thin rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 p-6 shadow-card"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-lg text-moon-200">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-moon-200/50 transition-colors hover:bg-night-700/60 hover:text-moon-200"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
