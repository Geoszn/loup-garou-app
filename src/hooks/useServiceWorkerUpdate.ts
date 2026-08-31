import { useEffect, useState } from 'react'

/** Détecte quand un nouveau déploiement a remplacé le service worker qui
 * contrôle cet onglet PENDANT qu'il était déjà ouvert (voir public/sw.js —
 * `self.skipWaiting()` + `clients.claim()` font prendre le contrôle
 * immédiatement au nouveau SW, sans attendre la fermeture de l'onglet).
 *
 * Sans ce signal, un onglet resté ouvert/suspendu (typique sur iOS
 * Safari/PWA, qui reprend souvent un onglet en veille plutôt que de le
 * recharger vraiment) continue d'exécuter l'ancien JS en mémoire
 * indéfiniment — de plus en plus désynchronisé du serveur au fil des
 * déploiements suivants. C'est la cause la plus probable des chargements
 * interminables / écrans blancs observés pendant les tests (retour
 * utilisateur, plusieurs déploiements coup sur coup le même jour).
 *
 * `controllerchange` se déclenche aussi lors de la toute première prise de
 * contrôle par un service worker (onglet jamais contrôlé jusque-là, ex :
 * tout premier chargement de l'appli) — sans la garde `hadControllerAtLoad`
 * ci-dessous, la bannière apparaîtrait à tort dès la toute première visite,
 * alors qu'il n'y a alors rien à mettre à jour. */
export function useServiceWorkerUpdate(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const hadControllerAtLoad = !!navigator.serviceWorker.controller

    function onControllerChange() {
      if (hadControllerAtLoad) setUpdateAvailable(true)
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  return updateAvailable
}
