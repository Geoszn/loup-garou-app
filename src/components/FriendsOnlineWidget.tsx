import { usePresence } from '../context/PresenceContext'
import { useLanguage } from '../i18n/LanguageContext'
import { AvatarIcon } from './AvatarIcon'
import { CopyButton } from './ui'

export interface FriendPerson {
  user_id: string
  username: string
  avatar_icon: string
}

/**
 * Liste des amis actuellement connectés (voir PresenceContext.tsx, canal
 * global distinct de la présence par partie de useGame.ts) — croise la
 * liste d'amis déjà chargée par Dashboard.tsx (get_my_social) avec l'état
 * de présence en direct. Ne s'affiche que s'il y a au moins un ami en ligne
 * : pas de carte vide "0 ami en ligne" qui n'apporterait rien.
 *
 * Pour un ami "en partie", affiche son code plutôt qu'un bouton "Rejoindre"
 * direct : rejoindre une partie déjà commencée dépend de règles qu'on ne
 * connaît pas ici (privée/publique, complet ou non) — le code copié
 * réutilise le flux "Rejoindre avec un code" déjà existant et déjà testé,
 * plutôt que d'introduire une nouvelle route de navigation qui pourrait
 * échouer sans message clair.
 */
export function FriendsOnlineWidget({ friends }: { friends: FriendPerson[] }) {
  const { onlineStatus } = usePresence()
  const { t } = useLanguage()

  const online = friends.filter((f) => onlineStatus[f.user_id])
  if (online.length === 0) return null

  return (
    <div className="rounded-2xl border border-night-600/60 bg-night-900/40 px-4 py-3.5">
      <p className="mb-2.5 text-xs uppercase tracking-widest text-moon-200/40">
        {t('friendsOnline.title', { count: online.length })}
      </p>
      <ul className="flex flex-col gap-2">
        {online.map((f) => {
          const presence = onlineStatus[f.user_id]
          const inGame = presence.status === 'in_game' && presence.game_code
          return (
            <li key={f.user_id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-moon-200/90">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${inGame ? 'bg-moon-300' : 'bg-emerald-400'}`}
                  aria-hidden="true"
                />
                <AvatarIcon icon={f.avatar_icon} className="h-4 w-4 shrink-0" />
                <span className="truncate">{f.username}</span>
              </span>
              {inGame ? (
                <CopyButton value={presence.game_code!} label={presence.game_code!} className="px-2.5 py-1 text-[11px]" />
              ) : (
                <span className="shrink-0 text-[11px] text-moon-200/40">{t('friendsOnline.idle')}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
