import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cachedRpc } from '../lib/rpcCache'
import { homeSection } from '../lib/homeBootstrap'
import { BottomNav } from './BottomNav'
import { useMyQuests } from '../hooks/useMyQuests'

/** Cadre commun des pages principales (Accueil, Récompenses, Jouer, Amis,
 * Profil) : la barre de navigation du bas, avec le nombre de demandes d'amis
 * en attente et l'indicateur « récompense à récupérer ». Les pages gardent leur
 * propre mise en page ; l'espace du bas leur est réservé ici. */
export function AppShell() {
  const { user } = useAuth()
  const location = useLocation()
  const [pendingFriends, setPendingFriends] = useState(0)
  const { claimableCount, reload: reloadQuests } = useMyQuests()

  useEffect(() => {
    if (!user) return
    let active = true
    // `force` : relecture réelle quand une demande d'ami arrive (évènement
    // Realtime) ; au montage on partage la requête de l'accueil (rpcCache.ts).
    async function load(force = false) {
      type Social = { incoming_requests?: unknown[] }
      const data = force
        ? (await cachedRpc<Social>('get_my_social', undefined, { force: true })).data
        : await homeSection<Social>('social', async () => (await cachedRpc<Social>('get_my_social')).data)
      if (active && data) setPendingFriends((data.incoming_requests ?? []).length)
    }
    void load()
    const channel = supabase
      .channel(`shell-social-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `addressee_id=eq.${user.id}` }, () => void load(true))
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [user])

  // Une récompense peut avoir été récupérée sur une autre page : on relit à chaque changement de page.
  useEffect(() => {
    void reloadQuests()
  }, [location.pathname, reloadQuests])

  return (
    <>
      <Outlet />
      <div aria-hidden="true" className="h-24" />
      <BottomNav pendingFriendCount={pendingFriends} claimable={claimableCount > 0} />
    </>
  )
}
