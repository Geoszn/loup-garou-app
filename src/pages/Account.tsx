import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AVATAR_ICONS } from '../lib/avatars'
import { Button, Card, ConfirmDialog, ErrorText, Input, Label, Modal, SuccessText } from '../components/ui'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { ContinentSelect } from '../components/ContinentSelect'
import { AvatarIcon } from '../components/AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'

// Délai entre l'affichage du message de succès dans une pop-up de réglage et
// le renvoi vers la création de salon : assez court pour ne pas faire
// attendre, assez long pour que le joueur voie bien que ça a marché avant
// d'être redirigé.
const REDIRECT_DELAY_MS = 700

// Doit rester synchronisé avec le cooldown appliqué côté serveur dans
// update_my_profile (migration 0051) — purement informatif ici (le serveur
// reste la seule source de vérité), mais permet d'afficher la bonne date
// et de désactiver le champ avant même de tenter l'appel.
const USERNAME_COOLDOWN_DAYS = 7

export default function Account() {
  const { profile, session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  function goToGameCreation() {
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="px-3.5 py-2 text-xs">
            {t('common.back')}
          </Button>
          <h1 className="font-display text-2xl text-moon-200">{t('account.title')}</h1>
        </header>

        <Card className="!p-0 divide-y divide-night-700/60">
          <SettingsRow
            label={t('account.profile.title')}
            description={
              profile ? (
                <span className="inline-flex items-center gap-1.5">
                  <AvatarIcon icon={profile.avatar_icon} className="h-3.5 w-3.5" /> {profile.username}
                </span>
              ) : undefined
            }
          >
            <Button variant="ghost" onClick={() => setProfileModalOpen(true)} className="px-3.5 py-2 text-xs">
              {t('account.profile.editButton')}
            </Button>
          </SettingsRow>

          <SettingsRow label={t('account.email.title')} description={session?.user.email}>
            <span className="text-xs text-moon-200/40">{t('account.email.locked')}</span>
          </SettingsRow>

          <SettingsRow label={t('account.language.title')}>
            <LanguageSwitcher onChanged={goToGameCreation} />
          </SettingsRow>

          <SettingsRow label={t('account.continent.title')} description={t('account.continent.description')}>
            <ContinentSelect />
          </SettingsRow>

          <SettingsRow label={t('account.password.title')}>
            <Button variant="ghost" onClick={() => setPasswordModalOpen(true)} className="px-3.5 py-2 text-xs">
              {t('account.password.changeButton')}
            </Button>
          </SettingsRow>
        </Card>

        <DangerZoneCard />
      </div>

      <ProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        profile={profile}
        onSaved={async () => {
          await refreshProfile()
          setTimeout(() => {
            setProfileModalOpen(false)
            goToGameCreation()
          }, REDIRECT_DELAY_MS)
        }}
      />

      <PasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        onSaved={() => {
          setTimeout(() => {
            setPasswordModalOpen(false)
            goToGameCreation()
          }, REDIRECT_DELAY_MS)
        }}
      />
    </div>
  )
}

/** Une ligne de réglage compacte (libellé + description optionnelle à gauche,
 * contrôle libre à droite) — remplace les grosses cartes détaillées d'avant
 * pour que la page reste courte et facile à parcourir d'un coup d'œil. */
function SettingsRow({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <p className="font-display text-base text-moon-200">{label}</p>
        {description && <p className="mt-0.5 text-xs text-moon-200/50">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function ProfileModal({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  profile: { username: string; avatar_icon: string; username_changed_at: string | null } | null
  onSaved: () => void
}) {
  const { t, lang } = useLanguage()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [icon, setIcon] = useState(profile?.avatar_icon ?? AVATAR_ICONS[0])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Resynchronise les champs sur les valeurs actuelles à chaque ouverture,
  // pour ne jamais réafficher un brouillon d'une session d'édition
  // précédente non sauvegardée.
  useEffect(() => {
    if (open) {
      setUsername(profile?.username ?? '')
      setIcon(profile?.avatar_icon ?? AVATAR_ICONS[0])
      setError(null)
      setSuccess(null)
      setConfirmOpen(false)
    }
  }, [open, profile])

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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
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
      setConfirmOpen(true)
      return
    }

    doSave()
  }

  async function doSave() {
    setConfirmOpen(false)
    setLoading(true)
    const { error: rpcError } = await supabase.rpc('update_my_profile', {
      p_username: username.trim(),
      p_avatar_icon: icon,
    })
    setLoading(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    setSuccess(t('account.profile.updated'))
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('account.profile.title')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="account-username">{t('account.profile.username')}</Label>
          <Input
            id="account-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={24}
            disabled={usernameLocked}
            required
          />
          {usernameLocked && nextAllowedLabel && (
            <p className="mt-1.5 text-xs text-moon-200/50">
              🔒 {t('account.profile.usernameLockedUntil', { date: nextAllowedLabel })}
            </p>
          )}
        </div>

        <div>
          <Label>{t('account.profile.avatarIcon')}</Label>
          <div className="grid grid-cols-5 gap-2">
            {AVATAR_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                aria-label={t('account.profile.chooseIcon', { icon: emoji })}
                className={`flex aspect-square items-center justify-center rounded-xl border transition-all ${
                  icon === emoji
                    ? 'border-blood-500 bg-gradient-to-b from-blood-700/30 to-blood-700/10 shadow-blood-glow'
                    : 'border-night-600/60 bg-night-900/50 hover:border-moon-400/50'
                }`}
              >
                <AvatarIcon icon={emoji} className="h-6 w-6" />
              </button>
            ))}
          </div>
        </div>

        <ErrorText>{error}</ErrorText>
        <SuccessText>{success}</SuccessText>

        <Button type="submit" disabled={loading || !!success} className="w-full">
          {loading ? t('common.saving') : t('common.save')}
        </Button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title={t('account.profile.confirmChangeTitle')}
        message={t('account.profile.confirmChangeMessage')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </Modal>
  )
}

function PasswordModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage()
  const { session } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
      setSuccess(null)
    }
  }, [open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (next.length < 6) {
      setError(t('account.password.tooShort'))
      return
    }
    if (next !== confirm) {
      setError(t('account.password.mismatch'))
      return
    }

    setLoading(true)

    // On revérifie le mot de passe actuel via une reconnexion silencieuse,
    // pour éviter qu'un appareil laissé connecté permette de changer le mot
    // de passe sans le connaître.
    if (session?.user.email) {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: current,
      })
      if (reauthError) {
        setLoading(false)
        setError(t('account.password.wrongCurrent'))
        return
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    setLoading(false)

    if (updateError) {
      setError(traduireErreur(updateError.message, t))
      return
    }

    setSuccess(t('account.password.updated'))
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('account.password.title')}>
      <p className="mb-4 text-sm text-moon-200/50">{t('account.password.subtitle')}</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="account-current-password">{t('account.password.current')}</Label>
          <Input
            id="account-current-password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <div>
          <Label htmlFor="account-new-password">{t('account.password.new')}</Label>
          <Input
            id="account-new-password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <div>
          <Label htmlFor="account-confirm-password">{t('account.password.confirm')}</Label>
          <Input
            id="account-confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        <ErrorText>{error}</ErrorText>
        <SuccessText>{success}</SuccessText>

        <Button type="submit" disabled={loading || !!success} variant="ghost" className="w-full">
          {loading ? t('account.password.submitting') : t('account.password.submit')}
        </Button>
      </form>
    </Modal>
  )
}

/** Demande de fermeture de compte : n'efface rien immédiatement (la
 * suppression réelle du compte nécessite les droits d'administration
 * Supabase, indisponibles côté client) — enregistre simplement la demande,
 * à charge pour l'éditeur de la traiter (voir Politique de confidentialité,
 * section 9). Le compte reste utilisable normalement en attendant. */
function DangerZoneCard() {
  const { t, lang } = useLanguage()
  const [requestedAt, setRequestedAt] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.rpc('get_my_account_deletion_request')
      if (!cancelled) {
        setRequestedAt(data?.requested_at ?? null)
        setLoadingStatus(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function confirmRequest() {
    setSending(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('request_account_deletion')
    setSending(false)
    setConfirming(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setRequestedAt(data?.requested_at ?? new Date().toISOString())
  }

  return (
    <Card className="border-blood-700/30">
      <h2 className="mb-1 font-display text-lg text-blood-400">{t('account.danger.title')}</h2>
      <p className="mb-5 text-sm text-moon-200/50">{t('account.danger.subtitle')}</p>

      {loadingStatus ? null : requestedAt ? (
        <p className="text-sm text-moon-200/70">
          {t('account.danger.requestedOn', {
            date: new Date(requestedAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US'),
          })}
        </p>
      ) : (
        <>
          <ErrorText>{error}</ErrorText>
          <Button variant="danger" onClick={() => setConfirming(true)} className="w-full">
            {t('account.danger.requestButton')}
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        title={t('account.danger.confirmTitle')}
        message={t('account.danger.confirmMessage')}
        confirmLabel={sending ? t('common.sending') : t('account.danger.confirmLabel')}
        danger
        onConfirm={confirmRequest}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  )
}

function traduireErreur(message: string, t: ReturnType<typeof useLanguage>['t']): string {
  if (message.toLowerCase().includes('password')) return t('account.password.invalid')
  return message
}
