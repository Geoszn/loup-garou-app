import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { AvatarStudio } from './AvatarStudio'
import { ConfirmDialog } from './ui'
import type { AvatarConfig } from '../lib/avatarParts'

// Doit rester synchronisé avec le cooldown appliqué côté serveur dans
// update_my_profile (migration 0051) — purement informatif ici.
const USERNAME_COOLDOWN_DAYS = 7

/** Éditeur de profil (pseudo + avatar), utilisé par Mon compte et par la page Profil. */
export function ProfileEditor({
  open,
  onClose,
  profile,
  avatar,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  profile: { username: string; avatar_icon: string; username_changed_at: string | null; rank_points: number } | null
  avatar: AvatarConfig | null
  onSaved: () => void
}) {
  const { t, lang } = useLanguage()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [pendingConfig, setPendingConfig] = useState<AvatarConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Resynchronise le pseudo sur la valeur actuelle à chaque ouverture, pour
  // ne jamais réafficher un brouillon d'une session d'édition précédente.
  useEffect(() => {
    if (open) {
      setUsername(profile?.username ?? '')
      setError(null)
      setSuccess(null)
      setConfirmOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Purement informatif côté client (le serveur revalide tout, voir
  // migration 0051) : sert à désactiver le champ et afficher la date de
  // déverrouillage sans attendre un aller-retour réseau qui échouerait de
  // toute façon.
  const nextAllowedChange = profile?.username_changed_at
    ? new Date(new Date(profile.username_changed_at).getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    : null
  const usernameLocked = !!nextAllowedChange && nextAllowedChange.getTime() > Date.now()
  const nextAllowedLabel = nextAllowedChange
    ? nextAllowedChange.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const usernameChanged = username.trim().length > 0 && username.trim().toLowerCase() !== (profile?.username ?? '').toLowerCase()

  function handleSave(config: AvatarConfig) {
    setError(null)
    setSuccess(null)

    if (username.trim().length < 2) {
      setError(t('account.profile.usernameTooShort'))
      return
    }

    // Changer de pseudo verrouille le champ pour 7 jours (voir migration
    // 0051) : on prévient explicitement avant de valider plutôt que de
    // laisser la surprise arriver la prochaine fois que le joueur essaiera
    // de le modifier.
    if (usernameChanged && !usernameLocked) {
      setPendingConfig(config)
      setConfirmOpen(true)
      return
    }

    doSave(config)
  }

  async function doSave(config: AvatarConfig) {
    setConfirmOpen(false)
    setLoading(true)
    // L'ancienne icône n'est plus modifiable (remplacée par l'avatar) : on
    // la renvoie telle quelle, update_my_profile la revalide déjà.
    let rpcError: { message: string } | null = null
    if (usernameChanged && !usernameLocked) {
      const res = await supabase.rpc('update_my_profile', {
        p_username: username.trim(),
        p_avatar_icon: profile?.avatar_icon ?? '🐺',
      })
      rpcError = res.error
    }
    if (!rpcError) {
      const res = await supabase.rpc('set_my_avatar', { p_config: config })
      rpcError = res.error
    }
    setLoading(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    setSuccess(t('account.profile.updated'))
    onSaved()
  }

  return (
    <>
      <AvatarStudio
        open={open}
        onClose={onClose}
        initial={avatar}
        username={username}
        onUsernameChange={setUsername}
        usernameLocked={usernameLocked}
        usernameLockedNote={nextAllowedLabel ? t('account.profile.usernameLockedUntil', { date: nextAllowedLabel }) : null}
        onSave={handleSave}
        saving={loading}
        error={error}
        success={success}
      />
      <ConfirmDialog
        open={confirmOpen}
        title={t('account.profile.confirmChangeTitle')}
        message={t('account.profile.confirmChangeMessage')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => pendingConfig && doSave(pendingConfig)}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
