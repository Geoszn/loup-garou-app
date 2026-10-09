import type { ReactNode } from 'react'
import { LazyMotion } from 'framer-motion'

// Les composants animés utilisent `m` (léger) ; le moteur d'animation est téléchargé à part, sans
// bloquer le démarrage. `strict` fait échouer tout `motion.*` oublié, qui réembarquerait tout le moteur.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={() => import('../lib/motionFeatures').then((mod) => mod.default)} strict>
      {children}
    </LazyMotion>
  )
}
