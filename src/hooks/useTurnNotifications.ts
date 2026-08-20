import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'

const STORAGE_KEY = 'lg-turn-notifications'

const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  cupidon: 'turnNotif.cupidon',
  voyante: 'turnNotif.voyante',
  loup_garou: 'turnNotif.loup_garou',
  loup_alpha: 'turnNotif.loup_alpha',
  sorciere: 'turnNotif.sorciere',
  vote: 'turnNotif.vote',
  hunter: 'turnNotif.hunter',
}

/** Notification navigateur "à vous de jouer", en option (l'utilisateur doit
 * l'activer explicitement, ça déclenche la demande de permission native).
 * Ne notifie que si l'onglet n'est pas déjà sous les yeux du joueur, et une
 * seule fois par tour (pas à chaque poll tant que l'action reste en attente). */
export function useTurnNotifications(pendingAction: string | null, phaseKey: string) {
  const { t } = useLanguage()
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [enabled, setEnabled] = useState(() => {
    if (!supported) return false
    try {
      return localStorage.getItem(STORAGE_KEY) === '1' && Notification.permission === 'granted'
    } catch {
      return false
    }
  })
  const lastNotifiedRef = useRef<string | null>(null)

  async function toggle() {
    if (!supported) return
    if (enabled) {
      setEnabled(false)
      try {
        localStorage.setItem(STORAGE_KEY, '0')
      } catch {
        /* stockage indisponible : tant pis, l'état reste seulement en mémoire */
      }
      return
    }
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission === 'granted') {
      setEnabled(true)
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    if (!supported || !enabled || !pendingAction) return
    if (document.hasFocus() && !document.hidden) return

    const key = `${phaseKey}:${pendingAction}`
    if (lastNotifiedRef.current === key) return
    lastNotifiedRef.current = key

    try {
      const labelKey = ACTION_LABEL_KEYS[pendingAction]
      const notif = new Notification(t('turnNotif.title'), {
        body: labelKey ? t(labelKey) : t('turnNotif.default'),
        icon: '/icons/icon-192.png',
        tag: 'lg-turn',
      })
      notif.onclick = () => {
        window.focus()
        notif.close()
      }
    } catch {
      /* certains navigateurs refusent silencieusement, rien à faire de plus */
    }
  }, [pendingAction, phaseKey, enabled, supported, t])

  return { supported, enabled, toggle }
}
