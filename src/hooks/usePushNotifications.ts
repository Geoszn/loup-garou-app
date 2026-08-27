import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { urlBase64ToUint8Array } from '../lib/pushSubscription'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** iPhone/iPad, y compris l'iPadOS 13+ qui s'annonce comme "Macintosh" dans
 * le user-agent mais se distingue d'un vrai Mac par son écran tactile. */
function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** true si le site tourne déjà en PWA installée (icône sur l'écran
 * d'accueil) plutôt que dans un onglet Safari classique — `standalone`
 * n'existe que sur Safari/iOS, `display-mode` est le standard suivi
 * ailleurs. */
function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    (window.navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/**
 * Notifications push web (voir migration 0105 + public/sw.js). Volontairement
 * limité au web (`Capacitor.isNativePlatform()` exclu) : dans la coquille
 * native, la WebView ne supporte pas de façon fiable la Push API standard
 * du navigateur — l'app native aura besoin de son propre circuit
 * (@capacitor/push-notifications + FCM), une brique séparée. Sur le web
 * (site déployé ou PWA installée), en revanche, ce hook fonctionne tel
 * quel dès que VITE_VAPID_PUBLIC_KEY est configurée.
 */
export function usePushNotifications() {
  const supported =
    !Capacitor.isNativePlatform() &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY

  // Cas particulier Safari/iOS : PushManager n'existe que si le site a été
  // ajouté à l'écran d'accueil (et iOS >= 16.4) — dans un onglet Safari
  // classique, `supported` ci-dessus est déjà `false` (PushManager absent),
  // mais on peut au moins expliquer pourquoi et quoi faire, plutôt que de
  // masquer purement et simplement le réglage.
  const needsHomeScreenInstall = !supported && isIosDevice() && !isStandaloneDisplay() && !Capacitor.isNativePlatform()

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported'
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // État initial : un abonnement navigateur peut déjà exister (activé lors
  // d'une session précédente) sans qu'on ait besoin de redemander la
  // permission — on se contente de vérifier ce qui est déjà là.
  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false))
  }, [supported])

  const subscribe = useCallback(async () => {
    if (!supported || !VAPID_PUBLIC_KEY) return
    setLoading(true)
    setError(null)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        throw new Error('Notifications refusées — active-les dans les réglages du navigateur pour continuer.')
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast nécessaire : le typage DOM de PushManager.subscribe attend un
        // Uint8Array<ArrayBuffer> strict, incompatible avec le type générique
        // (ArrayBufferLike) que TypeScript infère pour Uint8Array.from — le
        // navigateur, lui, accepte bien n'importe quel Uint8Array standard.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })

      const json = subscription.toJSON()
      const { error: rpcError } = await supabase.rpc('save_push_subscription', {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys?.p256dh,
        p_auth: json.keys?.auth,
      })
      if (rpcError) throw new Error(rpcError.message)

      setSubscribed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation impossible.')
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }, [supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        // Retire d'abord côté serveur (endpoint encore connu), puis côté
        // navigateur — dans cet ordre, une coupure réseau entre les deux
        // laisse au pire une ligne orpheline en base (inoffensif, un futur
        // envoi échouera juste silencieusement dessus) plutôt qu'un
        // abonnement navigateur fantôme qu'on ne peut plus jamais retrouver.
        await supabase.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint })
        await subscription.unsubscribe()
      }
      setSubscribed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Désactivation impossible.')
    } finally {
      setLoading(false)
    }
  }, [supported])

  return { supported, needsHomeScreenInstall, permission, subscribed, loading, error, subscribe, unsubscribe }
}
