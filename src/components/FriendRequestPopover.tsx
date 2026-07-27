import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { AvatarIcon } from './AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'

/** Petite carte flottante ancrée sous un avatar cliqué, pour envoyer une
 * demande d'ami sans quitter l'écran de jeu (village, salon d'attente, fin
 * de partie...). `onClose` ferme le popover après un clic ailleurs sur la
 * page (voir PlayerGrid) ; `stopPropagation` sur le conteneur évite que ce
 * même clic-ailleurs global ne se déclenche pour un clic à l'intérieur. */
export function FriendRequestPopover({
  userId,
  displayName,
  avatarIcon,
  onClose,
}: {
  userId: string
  displayName: string
  avatarIcon?: string | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function send() {
    setSending(true)
    const { data, error } = await supabase.rpc('send_friend_request_by_user_id', { p_target_user_id: userId })
    setSending(false)
    if (error) {
      setResult({ ok: false, message: error.message })
      return
    }
    setResult({
      ok: true,
      message: data?.status === 'accepted' ? t('friendPopover.becameFriends') : t('friendPopover.sent'),
    })
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute left-1/2 top-full z-20 mt-2 w-44 -translate-x-1/2 rounded-xl border border-night-600 bg-night-800 p-3 text-left shadow-card"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-moon-200">
          <AvatarIcon icon={avatarIcon} className="h-3.5 w-3.5 shrink-0" /> {displayName}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-moon-200/40 transition-colors hover:text-moon-200"
          title={t('friendPopover.close')}
        >
          ✕
        </button>
      </div>
      {result ? (
        <p className={`text-xs ${result.ok ? 'text-emerald-400' : 'text-blood-400'}`}>{result.message}</p>
      ) : (
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="w-full rounded-lg bg-blood-600 px-2 py-1.5 text-xs font-semibold text-[#fdf6e3] transition-colors hover:bg-blood-500 disabled:opacity-50"
        >
          {sending ? t('friendPopover.sending') : t('friendPopover.addButton')}
        </button>
      )}
    </div>
  )
}
