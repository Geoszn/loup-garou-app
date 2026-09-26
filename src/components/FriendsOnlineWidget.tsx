import { useState } from 'react'
import { usePresence } from '../context/PresenceContext'
import { useLanguage } from '../i18n/LanguageContext'
import { AvatarIcon } from './AvatarIcon'
import { CopyButton } from './ui'
import { Avatar } from './Avatar'
import { CollapsibleCard, PAGE_SIZE, Pager } from './CollapsibleCard'

export interface FriendPerson {
  user_id: string
  username: string
  avatar_icon: string
  avatar_config?: unknown
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
  const [page, setPage] = useState(0)

  const online = friends.filter((f) => onlineStatus[f.user_id])
  if (online.length === 0) return null

  const pageCount = Math.ceil(online.length / PAGE_SIZE)
  const current = Math.min(page, pageCount - 1)
  const visible = online.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <CollapsibleCard storageKey="lg-dash-friends-open" title={t('friendsOnline.title', { count: online.length })}>
      <div className="flex flex-col gap-2 px-4 py-3">
        <ul className="flex flex-col gap-2">
          {visible.map((f) => {
            const presence = onlineStatus[f.user_id]
            const inGame = presence.status === 'in_game' && presence.game_code
            return (
              <li key={f.user_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 text-moon-200/90">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${inGame ? 'bg-moon-300' : 'bg-emerald-400'}`}
                    aria-hidden="true"
                  />
                  <Avatar config={f.avatar_config} icon={f.avatar_icon} name={f.username} className="h-6 w-6" />
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
        <Pager page={current} pageCount={pageCount} onChange={setPage} />
      </div>
    </CollapsibleCard>
  )
}
