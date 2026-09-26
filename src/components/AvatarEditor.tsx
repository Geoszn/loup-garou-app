import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { parseAvatarConfig, type AvatarConfig } from '../lib/avatarParts'

export const AVATAR_CHANGED_EVENT = 'lg-avatar-changed'

/** À appeler après tout enregistrement d'avatar pour rafraîchir les affichages. */
export function notifyAvatarChanged() {
  window.dispatchEvent(new Event(AVATAR_CHANGED_EVENT))
}

/** Pièces débloquées par les skins possédés, sous la forme « type:valeur »
 * (ex. « outfit:royal »). Vide si la fonction n'existe pas encore en base. */
export function useMyUnlockedParts(enabled = true): Set<string> {
  const { user } = useAuth()
  const [parts, setParts] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!user || !enabled) return
    let active = true
    supabase.rpc('get_my_unlocked_parts').then(({ data, error }) => {
      if (active && !error && Array.isArray(data)) setParts(new Set(data as string[]))
    })
    return () => {
      active = false
    }
  }, [user, enabled])
  return parts
}

/** Charge la configuration d'avatar du joueur connecté. Requête séparée du
 * chargement du profil (AuthContext) : si la colonne n'existe pas encore en
 * base, seule cette lecture échoue (config = null), jamais la connexion. */
export function useMyAvatarConfig() {
  const { user } = useAuth()
  const [config, setConfig] = useState<AvatarConfig | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)

  // Recharge quand l'avatar change ailleurs dans l'appli (éditeur, skin équipé).
  useEffect(() => {
    const onChanged = () => setVersion((v) => v + 1)
    window.addEventListener(AVATAR_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(AVATAR_CHANGED_EVENT, onChanged)
  }, [])

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
