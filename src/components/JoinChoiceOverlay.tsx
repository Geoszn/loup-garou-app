import { GameInProgressChoice } from './GameInProgressChoice'
import type { JoinPublicGame } from '../hooks/useJoinPublicGame'

/** Pop-up « rejoindre ou regarder » pour une partie déjà en cours — pas le
 * Modal partagé de ui.tsx, qui ajoute déjà sa propre carte/en-tête autour de
 * son contenu : GameInProgressChoice est lui-même une carte autonome, faite
 * pour être centrée directement (même patron que JoinByLink.tsx). */
export function JoinChoiceOverlay({ join }: { join: JoinPublicGame }) {
  if (!join.choiceGame) return null
  return (
    <div
      className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={join.closeChoice}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <GameInProgressChoice
          onWatch={join.watchChosen}
          onRequestOnly={join.requestOnlyChosen}
          onCancel={join.closeChoice}
          busy={join.requestingId === join.choiceGame.game_id}
        />
      </div>
    </div>
  )
}
