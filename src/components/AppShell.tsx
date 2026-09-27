import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
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
    async function load() {
      const { data } = await supabase.rpc('get_my_social')
      if (active && data) setPendingFriends((data.incoming_requests ?? []).length)
    }
    void load()
    const channel = supabase
      .channel(`shell-social-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `addressee_id=eq.${user.id}` }, load)
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
