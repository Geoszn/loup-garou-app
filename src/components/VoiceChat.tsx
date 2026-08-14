import { useVoiceChat, type VoiceChannel } from '../hooks/useVoiceChat'
import { useLanguage } from '../i18n/LanguageContext'

export function VoiceChat({
  gameId,
  code,
  channel,
  displayName,
  // Fantôme qui écoute le village sans y participer (voir GameRoom.tsx,
  // onglet "Village" des fantômes) : pas de bouton pour s'activer, juste un
  // badge "écoute seule". Toujours `false` pour un salon normal.
  listenOnly = false,
}: {
  gameId: string
  code: string
  channel: VoiceChannel
  displayName: string
  listenOnly?: boolean
}) {
  const {
    connected,
    connecting,
    muted,
    participants,
    error,
    toggleMute,
    canModerate,
    muteParticipant,
    retry,
    speakingIds,
    selfSpeaking,
    deafened,
    toggleSound,
    forcedMuteNotice,
  } = useVoiceChat(gameId, code, channel, displayName, listenOnly)
  const { t } = useLanguage()

  if (!channel) return null

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-night-600/60 bg-night-900/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl shrink-0">🎙️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-moon-200">
            {connecting ? t('voiceChat.connecting') : connected ? t('voiceChat.connected') : t('voiceChat.unavailable')}
          </p>
          <p className="truncate text-xs text-moon-200/50">
            {connected
              ? participants.length > 0
                ? t('voiceChat.othersOnline', { count: participants.length, s: participants.length > 1 ? 's' : '' })
                : t('voiceChat.alone')
              : error ?? '...'}
          </p>
        </div>
        {!connected && !connecting && error && (
          <button
            type="button"
            onClick={retry}
            className="shrink-0 rounded-xl bg-night-700/70 px-3 py-2 text-xs font-semibold text-moon-200 transition-colors hover:bg-night-600/70"
          >
            {t('voiceChat.retry')}
          </button>
        )}
        {connected && listenOnly && (
          <span className="shrink-0 rounded-xl bg-night-700/50 px-3 py-2 text-xs font-semibold text-moon-200/50">
            {t('voiceChat.listenOnly')}
          </span>
        )}
        {/* Badge permanent (pas juste les boutons de mute par joueur, qui
            eux n'apparaissent que si quelqu'un a le micro actif) : sans lui,
            un hôte qui teste seul ou avec des joueurs qui n'ont jamais
            activé leur micro n'a AUCUN signe que la fonction existe. */}
        {connected && canModerate && (
          <span
            title={t('voiceChat.moderatorHint')}
            className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400"
          >
            🎚️ {t('voiceChat.moderatorBadge')}
          </span>
        )}
        {connected && (
          // Ce qu'on ENTEND — indépendant du micro, ne coupe jamais la
          // connexion ni ne fait quitter/rejoindre le salon (voir
          // toggleSound, useVoiceChat.ts). Utile aussi pour un fantôme en
          // écoute seule (listenOnly) : lui n'a pas de bouton micro, mais
          // peut quand même vouloir se couper le son un instant.
          //
          // Icône seule (pas de texte) et plus petit qu'avant (rond h-8 w-8
          // plutôt qu'un pavé px-3 py-2) — retour utilisateur : ces deux
          // boutons (celui-ci et le suivant) prenaient trop de place à côté
          // du statut de connexion, surtout sur mobile où l'en-tête doit déjà
          // partager la largeur avec le badge modérateur.
          <button
            onClick={toggleSound}
            title={deafened ? t('voiceChat.soundOffTitle') : t('voiceChat.soundOnTitle')}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
              deafened ? 'bg-blood-700/40 text-blood-400' : 'bg-night-700/70 text-moon-200'
            }`}
          >
            {deafened ? '🔇' : '🔊'}
          </button>
        )}
        {connected && !listenOnly && (
          <button
            onClick={toggleMute}
            title={muted ? t('voiceChat.muted') : t('voiceChat.active')}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
              muted ? 'bg-blood-700/40 text-blood-400' : 'bg-night-700/70 text-moon-200'
            }`}
          >
            {muted ? '🔇' : '🎤'}
          </button>
        )}
      </div>

      {/* Avertissement ponctuel (voir forcedMuteNotice, useVoiceChat.ts) :
          jusqu'ici, se faire couper le micro par le modérateur ne laissait
          absolument aucune trace visible côté victime — son propre bouton
          continuait d'afficher "Actif". S'efface tout seul après quelques
          secondes, ou dès qu'on clique le bouton micro pour reparler. */}
      {connected && forcedMuteNotice && (
        <p className="animate-fade-in rounded-xl border border-blood-500/40 bg-blood-500/10 px-3 py-2 text-xs text-blood-400">
          {t('voiceChat.mutedByModeratorNotice')}
        </p>
      )}

      {connected && (participants.length > 0 || !listenOnly) && (
        // Grille à colonnes fixes plutôt qu'une liste de pills en
        // `flex-wrap` (ancien design) : avec beaucoup de joueurs, des pills
        // de largeurs différentes s'empilaient sur des lignes irrégulières,
        // difficile à parcourir d'un coup d'œil pour le modérateur. Chaque
        // case a désormais la même taille, alignée en colonnes — propre et
        // lisible même à 10+ joueurs, sans que la hauteur totale explose
        // (2-3 colonnes selon la largeur d'écran, cases basses et denses).
        <ul className="grid grid-cols-2 gap-1 border-t border-night-700/60 pt-2 sm:grid-cols-3">
          {/* Son propre voyant, toujours affiché en premier (sauf en écoute
              seule, où on n'a de toute façon pas de micro à surveiller) :
              avant, useVoiceChat excluait totalement le participant local de
              `participants` et de `speakingIds` (l'API Daily ne donne le
              niveau sonore local que via un évènement séparé,
              'local-audio-level') — impossible de savoir si son propre
              micro était bien capté pendant que d'autres parlaient. */}
          {!listenOnly && (
            <li
              title={t('voiceChat.selfPillHint')}
              className={`flex min-w-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs text-moon-200/80 transition-colors ${
                selfSpeaking
                  ? 'border-emerald-400/70 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(52,211,153,0.3)]'
                  : 'border-night-600/60 bg-night-800/60'
              }`}
            >
              <span className={`shrink-0 text-[11px] ${selfSpeaking ? 'animate-pulse' : ''}`}>{muted ? '🔇' : '🎤'}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-moon-200">{t('voiceChat.you')}</span>
            </li>
          )}
          {participants.map((p) => (
            <li
              key={p.id}
              className={`flex min-w-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs text-moon-200/80 transition-colors ${
                speakingIds.has(p.id)
                  ? 'border-emerald-400/70 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(52,211,153,0.3)]'
                  : 'border-night-600/60 bg-night-800/60'
              }`}
            >
              {/* Micro actif (audioOn) ne veut pas dire "en train de parler" —
                  l'anneau vert (speakingIds, niveau sonore réel via
                  startRemoteParticipantsAudioLevelObserver) est le seul vrai
                  indicateur de qui parle réellement en ce moment, pas juste
                  qui a le droit de parler. */}
              <span className={`shrink-0 text-[11px] ${speakingIds.has(p.id) ? 'animate-pulse' : ''}`}>
                {p.audioOn ? '🎤' : '🔇'}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {/* Bouton icône seule (plus de libellé "Couper"/"Coupé" en
                  toutes lettres, voir titre pour l'explicite) : dans une case
                  de grille déjà étroite, un bouton texte forçait soit à
                  tronquer le nom du joueur, soit à faire déborder la case.
                  Le distinguo "état" vs "action" reste porté par la couleur
                  (rouge = action possible, gris = déjà coupé, rien à faire)
                  plutôt que par du texte. */}
              {canModerate &&
                (p.audioOn ? (
                  <button
                    onClick={() => muteParticipant(p.id)}
                    title={t('voiceChat.muteParticipantTitle', { name: p.name })}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blood-700/40 text-[10px] text-blood-400 transition-colors hover:bg-blood-700/60"
                  >
                    🔇
                  </button>
                ) : (
                  <span
                    title={t('voiceChat.alreadyMuted')}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-night-700/50 text-[10px] text-moon-200/30"
                  >
                    🔇
                  </span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
