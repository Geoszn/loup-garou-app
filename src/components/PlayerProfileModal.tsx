import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { notifyFriendRequest } from '../lib/pushSubscription'
import { tierInfo, tierLabel } from '../lib/ranks'
import { CONTINENTS } from '../lib/continents'
import { Button, ErrorText, Modal } from './ui'
import { AvatarIcon } from './AvatarIcon'
import { RankTierBadge } from './RankTierBadge'
import { useLanguage } from '../i18n/LanguageContext'

type FriendStatus = 'self' | 'friends' | 'pending_sent' | 'pending_received' | 'none'

interface PlayerProfile {
  user_id: string
  username: string
  avatar_icon: string | null
  continent: string | null
  rank_points: number
  tier: string
  current_streak: number
  best_streak: number
  rank_wins: number
  rank_games_played: number
  friend_status: FriendStatus
  request_id: string | null
}

/**
 * Fiche joueur en pop-up : stats publiques (voir get_player_public_profile,
 * migration 0107) + action ami adaptée à la relation actuelle, plutôt que
 * de risquer une erreur "demande déjà envoyée" en proposant toujours le
 * même bouton. Ouverte depuis le salon d'attente (Lobby.tsx) en cliquant
 * sur un autre joueur — remplace l'ancien FriendRequestPopover, trop
 * limité pour porter tout ça (toujours utilisé tel quel ailleurs, pendant
 * une partie en cours, où l'espace disponible est plus contraint).
 */
export function PlayerProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t, lang } = useLanguage()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setProfile(null)
    supabase
      .rpc('get_player_public_profile', { p_user_id: userId })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        setLoading(false)
        if (rpcError) {
          setError(rpcError.message)
          return
        }
        setProfile(data as PlayerProfile)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function addFriend() {
    setActing(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('send_friend_request_by_user_id', { p_target_user_id: userId })
    setActing(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (data?.status === 'pending') void notifyFriendRequest(userId)
    setProfile((p) => (p ? { ...p, friend_status: data?.status === 'accepted' ? 'friends' : 'pending_sent' } : p))
  }

  async function acceptFriend() {
    if (!profile?.request_id) return
    setActing(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('respond_friend_request', {
      p_request_id: profile.request_id,
      p_accept: true,
    })
    setActing(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setProfile((p) => (p ? { ...p, friend_status: 'friends' } : p))
  }

  const tier = profile ? tierInfo(profile.tier) : null
  const continent = profile?.continent ? CONTINENTS.find((c) => c.code === profile.continent) : undefined
  const winRate =
    profile && profile.rank_games_played > 0 ? Math.round((profile.rank_wins / profile.rank_games_played) * 100) : null

  return (
    <Modal open onClose={onClose} title={profile?.username ?? t('common.loading')}>
      {loading && <p className="text-sm text-moon-200/50">{t('common.loading')}</p>}
      <ErrorText>{error}</ErrorText>

      {profile && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <AvatarIcon icon={profile.avatar_icon} className="h-10 w-10" />
            {tier && (
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm text-moon-200">
                  <RankTierBadge tier={tier.id} size={18} />
                  {tierLabel(tier.id, t)}
                </span>
                <span className="text-xs text-moon-200/50">{profile.rank_points} pts</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-night-700/60 bg-night-900/40 p-3 text-sm">
            <Stat label={t('stats.gamesPlayed')} value={profile.rank_games_played} />
            <Stat label={t('stats.gamesWon')} value={profile.rank_wins} />
            {winRate !== null && <Stat label={t('stats.winRate')} value={`${winRate}%`} />}
            {profile.current_streak >= 2 && <Stat label="🔥" value={profile.current_streak} />}
          </div>

          {continent && (
            <p className="text-xs text-moon-200/50">
              {continent.emoji} {lang === 'fr' ? continent.fr : continent.en}
            </p>
          )}

          {profile.friend_status === 'none' && (
            <Button onClick={addFriend} disabled={acting} className="w-full">
              {acting ? t('friendPopover.sending') : t('friendPopover.addButton')}
            </Button>
          )}
          {profile.friend_status === 'pending_sent' && (
            <p className="text-center text-xs text-moon-200/50">{t('roster.friendSent')}</p>
          )}
          {profile.friend_status === 'pending_received' && (
            <Button onClick={acceptFriend} disabled={acting} className="w-full">
              {acting ? t('common.loading') : t('playerProfile.acceptRequest')}
            </Button>
          )}
          {profile.friend_status === 'friends' && (
            <p className="text-center text-xs text-emerald-400">{t('roster.becameFriends')}</p>
          )}
        </div>
      )}
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-base font-semibold text-moon-200">{value}</p>
      <p className="text-xs text-moon-200/50">{label}</p>
    </div>
  )
}
