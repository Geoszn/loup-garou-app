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
          <button
            onClick={toggleSound}
            title={deafened ? t('voiceChat.soundOffTitle') : t('voiceChat.soundOnTitle')}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              deafened ? 'bg-blood-700/40 text-blood-400' : 'bg-night-700/70 text-moon-200'
            }`}
          >
            {deafened ? '🔇' : '🔊'}
          </button>
        )}
        {connected && !listenOnly && (
          <button
            onClick={toggleMute}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              muted ? 'bg-blood-700/40 text-blood-400' : 'bg-night-700/70 text-moon-200'
            }`}
          >
            {muted ? t('voiceChat.muted') : t('voiceChat.active')}
          </button>
        )}
      </div>

      {connected && (participants.length > 0 || !listenOnly) && (
        <ul className="flex flex-wrap gap-1.5 border-t border-night-700/60 pt-2">
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
              className={`flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-3 text-xs text-moon-200/80 transition-colors ${
                selfSpeaking
                  ? 'border-emerald-400/70 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(52,211,153,0.3)]'
                  : 'border-night-600/60 bg-night-800/60'
              }`}
            >
              <span className={selfSpeaking ? 'animate-pulse' : ''}>{muted ? '🔇' : '🎤'}</span>
              <span className="max-w-[100px] truncate font-semibold text-moon-200">{t('voiceChat.you')}</span>
            </li>
          )}
          {participants.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-xs text-moon-200/80 transition-colors ${
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
              <span className={speakingIds.has(p.id) ? 'animate-pulse' : ''}>{p.audioOn ? '🎤' : '🔇'}</span>
              <span className="max-w-[100px] truncate">{p.name}</span>
              {/* Toujours affiché dès qu'on modère (pas seulement si le
                  micro est actif) : sinon rien ne prouve que la fonction
                  existe tant que personne ne s'est activé — juste désactivé
                  (griser) une fois le micro déjà coupé, plutôt que de
                  disparaître entièrement. */}
              {canModerate && (
                <button
                  onClick={() => p.audioOn && muteParticipant(p.id)}
                  disabled={!p.audioOn}
                  title={p.audioOn ? t('voiceChat.muteParticipantTitle', { name: p.name }) : t('voiceChat.alreadyMuted')}
                  className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                    p.audioOn ? 'text-blood-400 hover:bg-blood-700/30' : 'cursor-default text-moon-200/15'
                  }`}
                >
                  🔇
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
