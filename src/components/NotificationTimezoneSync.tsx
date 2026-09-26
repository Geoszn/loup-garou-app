import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

/** Mémorise le décalage horaire du joueur pour que les notifications
 * personnalisées (migration 0189) respectent son heure locale. */
export function NotificationTimezoneSync() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user) return
    void supabase.rpc('set_my_timezone', { p_offset_min: -new Date().getTimezoneOffset() })
  }, [user])
  return null
}
