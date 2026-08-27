import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AVATAR_ICONS, AVATAR_ICON_MIN_POINTS, type AvatarIcon as AvatarIconId } from '../lib/avatars'
import { tierForPoints, tierLabel } from '../lib/ranks'
import { Button, Card, ConfirmDialog, ErrorText, Input, Label, Modal, SuccessText } from '../components/ui'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { ContinentSelect } from '../components/ContinentSelect'
import { AvatarIcon } from '../components/AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { sendTestPush } from '../lib/pushSubscription'

// Délai entre l'affichage du message de succès dans une pop-up de réglage et
// la fermeture automatique de cette pop-up : assez court pour ne pas faire
// attendre, assez long pour que le joueur voie bien que ça a marché. On reste
// ensuite sur "Mon compte" (avant, une redirection vers /dashboard était
// déclenchée après CHAQUE sauvegarde — profil, mot de passe, langue —,
// empêchant d'enchaîner plusieurs réglages sans revenir en arrière à chaque
// fois) plutôt que de renvoyer où que ce soit.
const CLOSE_DELAY_MS = 700

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
            <LanguageSwitcher />
          </SettingsRow>

          <SettingsRow label={t('account.continent.title')} description={t('account.continent.description')}>
            <ContinentSelect />
          </SettingsRow>

          <SettingsRow label={t('account.password.title')}>
            <Button variant="ghost" onClick={() => setPasswordModalOpen(true)} className="px-3.5 py-2 text-xs">
              {t('account.password.changeButton')}
            </Button>
          </SettingsRow>

          <NotificationsRow />
        </Card>

        <DangerZoneCard />
      </div>

      <ProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        profile={profile}
        onSaved={async () => {
          await refreshProfile()
          setTimeout(() => setProfileModalOpen(false), CLOSE_DELAY_MS)
        }}
      />

      <PasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        onSaved={() => {
          setTimeout(() => setPasswordModalOpen(false), CLOSE_DELAY_MS)
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
      {/* min-w-0 : sans ça, un texte de description un peu long (voir le
          réglage Notifications) refuse de se réduire dans ce conteneur flex
          et pousse le contrôle de droite hors de la ligne au lieu de passer
          à la ligne proprement — un piège classique de flexbox avec du
          texte. break-words en filet de sécurité pour un mot isolé trop
          long (peu probable en pratique, mais coûte rien). */}
      <div className="min-w-0 flex-1 break-words">
        <p className="font-display text-base text-moon-200">{label}</p>
        {description && <p className="mt-0.5 text-xs text-moon-200/50">{description}</p>}
      </div>
      {children}
    </div>
  )
}

/** Réglage "Notifications" (voir usePushNotifications.ts) : active/désactive
 * les push web, plus un bouton de test discret une fois activées, pour
 * vérifier la chaîne complète sans attendre un vrai événement de jeu.
 * Masqué entièrement si le navigateur/contexte ne supporte pas la Push API
 * ET qu'il n'y a rien à faire pour y remédier (ex. app native — voir le
 * commentaire du hook). Cas particulier Safari/iOS (`needsHomeScreenInstall`) :
 * un onglet Safari classique n'a jamais accès à PushManager, mais ajouter le
 * site à l'écran d'accueil suffit à le débloquer — impossible à déclencher
 * par code sur iOS (Apple ne l'autorise pas), donc on explique la manip
 * plutôt que de rester silencieux. */
function NotificationsRow() {
  const { t } = useLanguage()
  const push = usePushNotifications()
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  if (!push.supported && push.needsHomeScreenInstall) {
    // Pas de SettingsRow ici (mise en page 2 colonnes label/contrôle) : le
    // texte d'explication est trop long pour tenir à côté d'un contrôle sans
    // paraître tassé — une liste d'étapes empilée, en pleine largeur, se lit
    // mieux qu'un paragraphe compressé (signalement utilisateur). Le
    // padding (px-5 py-4) reste identique aux autres lignes pour garder le
    // même rythme visuel dans la carte.
    return (
      <div className="flex flex-col gap-3 px-5 py-4">
        <div>
          <p className="font-display text-base text-moon-200">{t('account.notifications.title')}</p>
          <p className="mt-0.5 text-xs text-moon-200/50">{t('account.notifications.installIntro')}</p>
        </div>
        <ol className="flex flex-col gap-2">
          {[t('account.notifications.installStep1'), t('account.notifications.installStep2')].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-moon-200/70">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-moon-400/10 text-[11px] font-semibold text-moon-300">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (!push.supported) return null

  async function runTest() {
    setTestState('sending')
    setTestError(null)
    try {
      await sendTestPush()
      setTestState('sent')
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Échec de l’envoi.')
      setTestState('failed')
    }
  }

  return (
    <SettingsRow
      label={t('account.notifications.title')}
      description={
        push.error
          ? push.error
          : testState === 'sent'
            ? t('account.notifications.testSent')
            : testError || t('account.notifications.description')
      }
    >
      <div className="flex items-center gap-2">
        {push.subscribed && (
          <Button
            variant="ghost"
            onClick={runTest}
            disabled={testState === 'sending'}
            className="px-3.5 py-2 text-xs"
          >
            {testState === 'sending' ? t('account.notifications.testing') : t('account.notifications.testButton')}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => (push.subscribed ? push.unsubscribe() : push.subscribe())}
          disabled={push.loading}
          className="px-3.5 py-2 text-xs"
        >
          {push.loading
            ? t('common.loading')
            : push.subscribed
              ? t('account.notifications.disable')
              : t('account.notifications.enable')}
        </Button>
      </div>
    </SettingsRow>
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
  profile: { username: string; avatar_icon: string; username_changed_at: string | null; rank_points: number } | null
  onSaved: () => void
}) {
  const { t, lang } = useLanguage()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [icon, setIcon] = useState(profile?.avatar_icon ?? AVATAR_ICONS[0])
  // Points de rang actuels — détermine quelles icônes sont débloquées (voir
  // AVATAR_ICON_MIN_POINTS, lib/avatars.ts). Purement informatif : le
  // serveur revalide de toute façon dans update_my_profile (migration 0074).
  const rankPoints = profile?.rank_points ?? 0
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
            {AVATAR_ICONS.map((emoji) => {
              // Icônes premium débloquées par palier de rang (voir
              // AVATAR_ICON_MIN_POINTS, lib/avatars.ts) : grisées avec un
              // cadenas + le seuil requis plutôt que masquées, pour que
              // l'objectif reste visible même avant de l'atteindre.
              const minPoints = AVATAR_ICON_MIN_POINTS[emoji as AvatarIconId]
              const locked = rankPoints < minPoints
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => !locked && setIcon(emoji)}
                  disabled={locked}
                  aria-label={locked ? t('account.profile.iconLocked', { points: minPoints, tier: tierLabel(tierForPoints(minPoints).id, t) }) : t('account.profile.chooseIcon', { icon: emoji })}
                  title={locked ? t('account.profile.iconLocked', { points: minPoints, tier: tierLabel(tierForPoints(minPoints).id, t) }) : undefined}
                  className={`relative flex aspect-square items-center justify-center rounded-xl border transition-all ${
                    locked
                      ? 'cursor-not-allowed border-night-700/50 bg-night-900/30 opacity-40 grayscale'
                      : icon === emoji
                        ? 'border-blood-500 bg-gradient-to-b from-blood-700/30 to-blood-700/10 shadow-blood-glow'
                        : 'border-night-600/60 bg-night-900/50 hover:border-moon-400/50'
                  }`}
                >
                  <AvatarIcon icon={emoji} className="h-6 w-6" />
                  {locked && (
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-night-950 px-1 text-[8px] leading-tight text-moon-200/60">
                      {t('account.profile.iconLockedShort', { points: minPoints })}
                    </span>
                  )}
                </button>
              )
            })}
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
            autoComplete="current-password"
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
            autoComplete="new-password"
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
            autoComplete="new-password"
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
  const [cancelling, setCancelling] = useState(false)
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

  async function cancelRequest() {
    setCancelling(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('cancel_account_deletion')
    setCancelling(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setRequestedAt(null)
  }

  return (
    <Card className="border-blood-700/30">
      <h2 className="mb-1 font-display text-lg text-blood-400">{t('account.danger.title')}</h2>
      <p className="mb-5 text-sm text-moon-200/50">{t('account.danger.subtitle')}</p>

      {loadingStatus ? null : requestedAt ? (
        <>
          <p className="mb-4 text-sm text-moon-200/70">
            {t('account.danger.requestedOn', {
              date: new Date(requestedAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US'),
            })}
          </p>
          <ErrorText>{error}</ErrorText>
          <Button variant="ghost" onClick={cancelRequest} disabled={cancelling} className="w-full">
            {cancelling ? t('account.danger.cancelling') : t('account.danger.cancelButton')}
          </Button>
        </>
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
