import { Button, Card } from './ui'
import { useLanguage } from '../i18n/LanguageContext'

/** Choix explicite proposé quand la partie qu'on essaie de rejoindre (lien
 * d'invitation ou recherche de partie publique) est déjà en cours — retour
 * utilisateur : "il n'est pas obligé de rejoindre la partie automatiquement,
 * [...] le pop-up propose deux choix, rejoindre ou regarder". Une partie
 * encore au salon n'affiche jamais ce choix (rien à regarder, rejoindre
 * directement reste la seule option sensée) — voir JoinByLink.tsx et
 * PublicGamesBrowser.tsx, qui décident tous les deux AVANT d'appeler
 * join_game/request_join_public_game, pas après : aucune demande n'est
 * créée si le joueur choisit "Plus tard".
 *
 * « Regarder la partie » (en premier) ne crée AUCUNE demande : on observe en
 * lecture seule, sans rejoindre (watch_game, migration 0249). « Rejoindre la
 * partie » envoie la demande à l'hôte et ouvre l'observation en attendant son
 * acceptation (game_join_requests) : une fois accepté, on devient joueur. */
export function GameInProgressChoice({
  onWatch,
  onJoin,
  onCancel,
  busy,
}: {
  onWatch: () => void
  onJoin: () => void
  onCancel: () => void
  busy: boolean
}) {
  const { t } = useLanguage()
  return (
    <Card className="w-full max-w-sm text-center">
      <p className="mb-2 text-3xl">🌙</p>
      <p className="mb-1 font-display text-lg text-moon-200">{t('joinChoice.title')}</p>
      <p className="mb-5 text-sm text-moon-200/60">{t('joinChoice.body')}</p>
      <Button onClick={onWatch} disabled={busy} className="mb-2.5 w-full">
        {t('joinChoice.watch')}
      </Button>
      <Button variant="ghost" onClick={onJoin} disabled={busy} className="mb-3 w-full">
        {t('joinChoice.join')}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-xs text-moon-200/40 underline underline-offset-4 transition-colors hover:text-moon-200 disabled:opacity-50"
      >
        {t('joinChoice.later')}
      </button>
    </Card>
  )
}
