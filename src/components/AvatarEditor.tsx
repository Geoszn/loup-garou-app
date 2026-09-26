import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { parseAvatarConfig, type AvatarConfig } from '../lib/avatarParts'

/** Charge la configuration d'avatar du joueur connecté. Requête séparée du
 * chargement du profil (AuthContext) : si la colonne n'existe pas encore en
 * base, seule cette lecture échoue (config = null), jamais la connexion. */
export function useMyAvatarConfig() {
  const { user } = useAuth()
  const [config, setConfig] = useState<AvatarConfig | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    supabase
      .from('profiles')
      .select('avatar_config')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        setLoaded(true)
        if (error) return
        const value = (data as { avatar_config?: unknown } | null)?.avatar_config
        setConfig(parseAvatarConfig(value))
      })
    return () => {
      active = false
    }
  }, [user, version])

  return { config, loaded, reload: () => setVersion((v) => v + 1) }
}
