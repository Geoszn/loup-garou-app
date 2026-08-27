import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { Button, Modal } from './ui'
import { useLanguage } from '../i18n/LanguageContext'

const DISMISSED_KEY = 'loup-garou-notif-prompt-dismissed-at'
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000 // 14 jours avant de reproposer après un "Plus tard"

function recentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISSED_KEY)
  if (!raw) return false
  const at = Number(raw)
  return Number.isFinite(at) && Date.now() - at < COOLDOWN_MS
}

/**
 * Pop-up proposant d'activer les notifications, affichée automatiquement sur
 * le tableau de bord dès la connexion — mais seulement si le navigateur peut
 * réellement déclencher la demande de permission tout de suite
 * (`push.supported`, voir usePushNotifications.ts). Sur Safari/iOS hors
 * écran d'accueil, ce n'est jamais le cas : cette pop-up ne s'y affiche donc
 * pas, il n'y a rien à faire ici et maintenant — le guide dédié dans Mon
 * compte (section Notifications) suffit pour ce cas.
 *
 * Attend que le continent du profil soit déjà renseigné avant de s'afficher
 * (voir ContinentPrompt.tsx, montée juste avant sur le même tableau de bord)
 * pour ne jamais superposer deux pop-ups de bienvenue au même login — un
 * compte tout juste créé voit d'abord le continent, puis les notifications
 * à la connexion suivante une fois le continent choisi.
 *
 * "Plus tard" la ferme pour 14 jours (mémorisé en local, pas en base — un
 * simple confort d'affichage, pas un vrai réglage de compte). Un refus
 * explicite du navigateur (permission passée à "denied") l'empêche aussi de
 * revenir, puisque `push.permission` ne vaut alors plus jamais "default".
 */
export function NotificationOptInPrompt() {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const push = usePushNotifications()
  const [dismissed, setDismissed] = useState(false)

  const shouldOffer =
    !!profile &&
    !!profile.continent &&
    push.supported &&
    push.permission === 'default' &&
    !push.subscribed &&
    !dismissed &&
    !recentlyDismissed()

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setDismissed(true)
  }

  async function enable() {
    await push.subscribe()
    setDismissed(true)
  }

  return (
    <Modal open={shouldOffer} onClose={dismiss} title={`🔔 ${t('notifPrompt.title')}`}>
      <p className="mb-4 text-sm text-moon-200/60">{t('notifPrompt.subtitle')}</p>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={dismiss} disabled={push.loading} className="flex-1">
          {t('notifPrompt.later')}
        </Button>
        <Button onClick={enable} disabled={push.loading} className="flex-1">
          {push.loading ? t('common.loading') : t('notifPrompt.enable')}
        </Button>
      </div>
    </Modal>
  )
}
