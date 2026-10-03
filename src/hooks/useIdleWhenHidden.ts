import { useEffect, useState } from 'react'

// Daily facture le temps de CONNEXION : un joueur qui laisse l'appli en
// arrière-plan (autre onglet, téléphone verrouillé) reste compté tant que sa
// connexion vit. Après `delayMs` en arrière-plan, on la coupe ; dès que le
// joueur revient, `suspended` repasse à false et le vocal se reconnecte tout
// seul (son choix de « rejoindre » est conservé, voir useVoiceOptIn.ts).
export const IDLE_WHEN_HIDDEN_MS = 3 * 60 * 1000

export function useIdleWhenHidden(active: boolean, delayMs = IDLE_WHEN_HIDDEN_MS): boolean {
  const [suspended, setSuspended] = useState(false)

  useEffect(() => {
    if (!active) {
      setSuspended(false)
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    function onChange() {
      if (timer) clearTimeout(timer)
      timer = null
      if (document.visibilityState === 'hidden') timer = setTimeout(() => setSuspended(true), delayMs)
      else setSuspended(false)
    }
    onChange()
    document.addEventListener('visibilitychange', onChange)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onChange)
    }
  }, [active, delayMs])

  return suspended
}
