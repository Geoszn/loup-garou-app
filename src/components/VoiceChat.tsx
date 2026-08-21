import { useVoiceChat, type VoiceChannel } from '../hooks/useVoiceChat'
import { useLanguage } from '../i18n/LanguageContext'
import { AvatarIcon } from './AvatarIcon'
import type { PublicPlayer } from '../types/game'

export function VoiceChat({
  gameId,
  code,
  channel,
  displayName,
  // Identifiant Supabase du joueur local — voir useVoiceChat.ts, sert à
  // dédupliquer l'affichage quand ce même joueur se retrouve brièvement avec
  // deux connexions Daily simultanées (rechargement de page/app en arrière-
  // plan). `null` accepté (ex. écran de fin de partie où `user` peut ne pas
  // être encore chargé) : dans ce cas, repli sur le nom affiché uniquement.
  selfUserId,
  // Fantôme qui écoute le village sans y participer (voir GameRoom.tsx,
  // onglet "Village" des fantômes) : pas de bouton pour s'activer, juste un
  // badge "écoute seule". Toujours `false` pour un salon normal.
  listenOnly = false,
  // Liste des joueurs de la partie (view.players) — demande utilisateur :
  // "que chaque joueur ait son icône comme photo de profil même durant la
  // partie". Daily ne connaît que ce que le client lui donne au join()
  // (nom + uid), jamais l'icône/couleur choisie sur le profil ; on les
  // retrouve donc ici en recoupant chaque participant Daily avec cette
  // liste, par user_id. Optionnelle (défaut `[]`) : un appelant qui ne l'a
  // pas sous la main (aucun cas actuel) retombe simplement sur l'initiale du
  // nom, comme avant.
  players = [],
}: {
  gameId: string
  code: string
  channel: VoiceChannel
  displayName: string
  selfUserId: string | null
  listenOnly?: boolean
  players?: PublicPlayer[]
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
  } = useVoiceChat(gameId, code, channel, displayName, selfUserId, listenOnly)
  const { t } = useLanguage()

  if (!channel) return null

  const byId = new Map(players.map((p) => [p.user_id, p]))
  const me = selfUserId ? byId.get(selfUserId) : undefined

  // BUG CORRIGÉ (capture d'écran utilisateur : "le texte s'entremêle") : tout
  // (texte de statut + badges + boutons) tenait sur UNE seule ligne
  // flex-wrap, avec le bloc de texte en `flex-1 min-w-0`. Sur mobile, dès que
  // plusieurs badges coexistaient (écoute seule + modérateur, par exemple),
  // le texte se faisait écraser à une largeur quasi nulle et se repliait sur
  // lui-même au milieu des badges au lieu de passer proprement à la ligne.
  //
  // Refonte "moins imposant" (demande utilisateur, aperçu validé) : le
  // statut tient désormais sur UNE seule ligne tronquée (jamais de retour à
  // la ligne interne possible, donc plus jamais entremêlée), et la liste de
  // joueurs passe d'une grille de pavés à deux colonnes à une rangée de
  // petites pastilles (avatar + nom) qui s'enchaînent et se replient toutes
  // seules — beaucoup moins de hauteur à l'écran, surtout à 8-10 joueurs.
  const statusParts = [connecting ? t('voiceChat.connecting') : connected ? t('voiceChat.connected') : t('voiceChat.unavailable')]
  if (connected && listenOnly) statusParts.push(t('voiceChat.listenOnly'))
  if (connected) {
    statusParts.push(
      participants.length > 0 ? t('voiceChat.othersOnline', { count: participants.length, s: participants.length > 1 ? 's' : '' }) : t('voiceChat.alone')
    )
  } else if (!connecting && error) {
    statusParts.push(error)
  }

  // Demande utilisateur : fond UNIFORME pour toutes les icônes (une seule
  // couleur commune), seul le glyphe change d'un joueur à l'autre — avant,
  // chaque bulle reprenait la couleur d'avatar choisie par le joueur
  // (avatar_color), ce qui faisait un patchwork de couleurs différentes.
  function avatarBubble(icon: string | null | undefined, fallback: string, size: string) {
    return (
      <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-night-700 text-moon-200`}>
        {icon ? <AvatarIcon icon={icon} className="h-4 w-4" /> : <span className="text-[10px] font-bold">{fallback.slice(0, 1).toUpperCase()}</span>}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-night-600/60 bg-night-900/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-base">🎙️</span>
        <p className="min-w-0 flex-1 truncate text-xs text-moon-200/80">{statusParts.join(' · ')}</p>

        {!connected && !connecting && error && (
          <button
            type="button"
            onClick={retry}
            className="shrink-0 rounded-xl bg-night-700/70 px-2.5 py-1.5 text-[11px] font-semibold text-moon-200 transition-colors hover:bg-night-600/70"
          >
            {t('voiceChat.retry')}
          </button>
        )}
        {/* Badge modérateur réduit à un point (plus de texte en toutes
            lettres) : le titre au survol/appui long reste explicite. */}
        {connected && canModerate && (
          <span
            title={t('voiceChat.moderatorHint')}
            className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400"
          >
            🎚️
          </span>
        )}
        {connected && (
          <button
            onClick={toggleSound}
            title={deafened ? t('voiceChat.soundOffTitle') : t('voiceChat.soundOnTitle')}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] transition-colors ${
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
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] transition-colors ${
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
        <p className="animate-fade-in rounded-xl border border-blood-500/40 bg-blood-500/10 px-2.5 py-1.5 text-xs text-blood-400">
          {t('voiceChat.mutedByModeratorNotice')}
        </p>
      )}

      {connected && (participants.length > 0 || !listenOnly) && (
        // Grille (pas des pastilles en flex-wrap, largeur variable selon la
        // longueur du nom) : demande utilisateur — chaque case doit avoir
        // EXACTEMENT la même taille. Colonnes égales (grid-cols-N) : toutes
        // les cases d'une même rangée font automatiquement la même largeur,
        // et le contenu identique (avatar + 1 ligne de nom) leur donne aussi
        // la même hauteur.
        <div className="grid grid-cols-4 gap-1.5 border-t border-night-700/60 pt-2 sm:grid-cols-5">
          {!listenOnly && (
            <div
              title={t('voiceChat.selfPillHint')}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-center transition-colors ${
                selfSpeaking ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-night-600/60 bg-night-800/60'
              }`}
            >
              <span className="relative inline-flex">
                {avatarBubble(me?.avatar_icon, displayName, 'h-8 w-8')}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-night-900 bg-night-800 text-[8px]">
                  {muted ? '🔇' : '🎤'}
                </span>
              </span>
              <span className="max-w-full truncate text-[10px] font-semibold text-moon-200">{t('voiceChat.you')}</span>
            </div>
          )}
          {participants.map((p) => {
            const info = byId.get(p.id)
            const speaking = p.sessionIds.some((id) => speakingIds.has(id))
            return (
              <div
                key={p.id}
                className={`relative flex flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-center transition-colors ${
                  speaking ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-night-600/60 bg-night-800/60'
                }`}
              >
                {canModerate &&
                  (p.audioOn ? (
                    <button
                      onClick={() => muteParticipant(p.sessionIds)}
                      title={t('voiceChat.muteParticipantTitle', { name: p.name })}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blood-700/60 text-[9px] text-blood-200 transition-colors hover:bg-blood-700/80"
                    >
                      🔇
                    </button>
                  ) : (
                    <span
                      title={t('voiceChat.alreadyMuted')}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-night-700/70 text-[9px] text-moon-200/30"
                    >
                      🔇
                    </span>
                  ))}
                <span className="relative inline-flex">
                  {avatarBubble(info?.avatar_icon, p.name, 'h-8 w-8')}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-night-900 bg-night-800 text-[8px] ${
                      speaking ? 'animate-pulse' : ''
                    }`}
                  >
                    {p.audioOn ? '🎤' : '🔇'}
                  </span>
                </span>
                <span className="max-w-full truncate text-[10px] text-moon-200/80">{p.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
