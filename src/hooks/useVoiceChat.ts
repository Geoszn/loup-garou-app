import { useEffect, useRef, useState } from 'react'
import DailyIframe, { type DailyCall, type DailyEventObjectTrack } from '@daily-co/daily-js'
import { getVoiceRoomUrl } from '../lib/daily'
import { useLanguage } from '../i18n/LanguageContext'

// Niveau sonore (0 à 1, voir DailyParticipantsAudioLevel) au-dessus duquel un
// participant est considéré "en train de parler". Choisi empiriquement assez
// bas pour capter une voix normale sans s'allumer au moindre souffle/bruit de
// fond — à ajuster si trop sensible/pas assez en usage réel.
const SPEAKING_THRESHOLD = 0.02

export type VoiceChannel = 'lobby' | 'village' | 'graveyard' | null

interface VoiceParticipant {
  // Identifiant d'affichage stable pour ce JOUEUR (pas cette connexion) —
  // voir la déduplication dans refreshParticipants ci-dessous.
  id: string
  name: string
  audioOn: boolean
  // Toutes les connexions Daily (session_id) actuellement associées à ce
  // même joueur — normalement une seule, mais un rechargement de page/app
  // en arrière-plan (fréquent sur mobile) peut laisser une ancienne
  // connexion vivre quelques instants en parallèle de la nouvelle avant que
  // Daily ne la coupe pour inactivité. muteParticipant doit couper TOUTES
  // ces connexions à la fois, et le voyant "en train de parler" doit
  // s'allumer si N'IMPORTE LAQUELLE d'entre elles émet du son.
  sessionIds: string[]
}

export function useVoiceChat(
  gameId: string | null,
  code: string | null,
  channel: VoiceChannel,
  displayName: string,
  // Identifiant Supabase du joueur local (auth.uid()) : injecté dans
  // `userData` à la connexion (voir call.join() plus bas) pour donner à
  // chaque participant Daily une identité STABLE, propre à l'appli, plutôt
  // que le seul session_id généré par Daily à chaque connexion. Sert
  // uniquement à dédupliquer l'affichage (voir refreshParticipants) quand un
  // même joueur se retrouve brièvement avec deux connexions simultanées —
  // aucune vérification cryptographique, un client pourrait mentir sur cette
  // valeur, mais l'enjeu ici est purement cosmétique (éviter un nom en
  // double dans la liste), pas la sécurité.
  selfUserId: string | null,
  // Fantôme qui écoute le village (voir VoiceChat.tsx) : rejoint le salon
  // normalement (même URL, mêmes autorisations serveur — can_listen_channel,
  // migration 0041) mais toggleMute() ci-dessous devient un no-op, et le
  // micro n'est jamais publié. Même modèle de confiance côté client que le
  // mute à distance de l'hôte (muteParticipant) : rien de cryptographique,
  // juste un client qui ne propose jamais l'action.
  listenOnly = false
) {
  const { t } = useLanguage()
  const callRef = useRef<DailyCall | null>(null)
  const activeChannelRef = useRef<VoiceChannel>(null)
  // Le mode "call object" de Daily est headless : il ne joue AUCUN son tout
  // seul, contrairement au mode iframe. Il faut créer et brancher soi-même
  // un <audio> par piste distante reçue (voir 'track-started' ci-dessous) —
  // sans ça, la connexion réussit, le micro fonctionne, mais personne
  // n'entend jamais rien.
  const remoteAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  // Micro coupé par défaut à la connexion (voir startAudioOff dans
  // call.join() ci-dessous) : l'état local doit refléter ça dès le départ,
  // sinon le bouton affiche "Actif" alors que personne ne nous entend.
  const [muted, setMuted] = useState(true)
  // Ce qu'on a NOUS-MÊME demandé en dernier pour notre micro (true = actif) —
  // sert uniquement à distinguer, dans le handler 'participant-updated' plus
  // bas, un changement qu'on a soi-même déclenché (toggleMute) d'un
  // changement venu d'ailleurs. Le seul autre acteur possible est le
  // modérateur via muteParticipant (à sens unique, il ne peut que couper —
  // voir plus bas) : si notre micro devient coupé sans qu'on l'ait demandé,
  // c'est forcément lui.
  const desiredAudioRef = useRef(false)
  // BUG corrigé : le micro coupé à distance par le modérateur ne se
  // reflétait jamais sur l'écran de la victime elle-même — son bouton
  // continuait d'afficher "Actif" alors que plus personne ne l'entendait,
  // sans aucun moyen de savoir qu'elle avait été coupée ni de se réactiver
  // en connaissance de cause. `muted` est désormais resynchronisé depuis le
  // véritable état Daily (voir 'participant-updated' plus bas) au lieu
  // d'être une pure valeur locale gérée uniquement par toggleMute.
  // `forcedMuteNotice` déclenche un avertissement ponctuel côté victime,
  // affiché quelques secondes (voir l'effet de nettoyage automatique
  // plus bas et VoiceChat.tsx).
  const [forcedMuteNotice, setForcedMuteNotice] = useState(false)
  const [participants, setParticipants] = useState<VoiceParticipant[]>([])
  // true si l'utilisateur local a rejoint avec un jeton "propriétaire" Daily
  // (voir api/daily-room.ts, réservé à l'hôte de la partie) : lui seul peut
  // couper à distance le micro d'un autre joueur.
  const [canModerate, setCanModerate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ids (session_id) des participants dont le niveau sonore dépasse
  // SPEAKING_THRESHOLD à l'instant présent — voir
  // startRemoteParticipantsAudioLevelObserver ci-dessous, plus fiable que
  // l'évènement global 'active-speaker-change' de Daily (qui ne désigne
  // qu'UN seul "meneur" et est plus lent à réagir) : un vrai indicateur de
  // VOLUME par personne, pas juste "micro actif". Peut contenir plusieurs
  // ids si plusieurs joueurs parlent en même temps.
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set())
  // Signature texte du dernier speakingIds pour éviter un setState (donc un
  // rendu) à chaque tick de l'observateur de niveau sonore quand rien n'a
  // changé (silence prolongé, la majorité du temps) — voir usage plus bas.
  const speakingSignatureRef = useRef('')
  // Même principe que speakingIds mais pour SOI-MÊME : Daily ne rapporte le
  // niveau sonore local que via un évènement séparé ('local-audio-level',
  // et son propre observateur startLocalAudioLevelObserver) — l'observateur
  // "remote" ci-dessus ne concerne, par construction de l'API, que les
  // AUTRES participants. Sans ce second observateur, impossible de savoir
  // si son propre micro est bien capté (utile pour se rassurer que les
  // autres nous reçoivent, notamment en cours de partie). Un simple booléen
  // suffit (pas de Map/signature nécessaire comme pour speakingIds) : React
  // ignore déjà tout seul un setState avec la même valeur primitive, donc
  // pas de rendu superflu à chaque tick de l'observateur en silence.
  const [selfSpeaking, setSelfSpeaking] = useState(false)
  // "Assourdissement" : coupe ce qu'on ENTEND des autres, sans toucher à son
  // propre micro (symétrique de `muted`/toggleMute, voir toggleSound
  // ci-dessous). Appliqué à chaque <audio> distant existant ET futur.
  const [deafened, setDeafened] = useState(false)
  const deafenedRef = useRef(false)
  // Incrémenté par retry() ci-dessous : force l'effet de connexion à
  // rejouer même si gameId/code/channel n'ont pas changé, pour un nouvel
  // essai manuel après un échec (voir VoiceChat.tsx, bouton "Réessayer")
  // sans obliger le joueur à recharger toute la page.
  const [retryToken, setRetryToken] = useState(0)

  function clearRemoteAudio() {
    for (const el of remoteAudioElsRef.current.values()) {
      el.pause()
      el.srcObject = null
      el.remove()
    }
    remoteAudioElsRef.current.clear()
  }

  function attachRemoteTrack(evt: DailyEventObjectTrack) {
    if (evt.type !== 'audio' || !evt.participant || evt.participant.local) return
    const trackId = evt.track.id
    if (remoteAudioElsRef.current.has(trackId)) return

    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    audioEl.hidden = true
    audioEl.muted = deafenedRef.current
    audioEl.srcObject = new MediaStream([evt.track])
    document.body.appendChild(audioEl)
    remoteAudioElsRef.current.set(trackId, audioEl)
    audioEl.play().catch(() => {
      // Bloqué par la politique autoplay du navigateur (pas encore
      // d'interaction utilisateur sur la page) : on retentera au prochain
      // clic, la balise reste posée et prête.
    })
  }

  function detachRemoteTrack(evt: DailyEventObjectTrack) {
    const trackId = evt.track.id
    const el = remoteAudioElsRef.current.get(trackId)
    if (!el) return
    el.pause()
    el.srcObject = null
    el.remove()
    remoteAudioElsRef.current.delete(trackId)
  }

  async function teardown() {
    activeChannelRef.current = null
    const call = callRef.current
    callRef.current = null
    clearRemoteAudio()
    if (call) {
      try {
        call.stopRemoteParticipantsAudioLevelObserver()
      } catch {
        /* ignore */
      }
      try {
        call.stopLocalAudioLevelObserver()
      } catch {
        /* ignore */
      }
      try {
        await call.leave()
      } catch {
        /* ignore */
      }
      call.destroy()
    }
    setConnected(false)
    setParticipants([])
    setCanModerate(false)
    setSpeakingIds(new Set())
    speakingSignatureRef.current = ''
    setSelfSpeaking(false)
    setForcedMuteNotice(false)
    // Remis à zéro à chaque déconnexion (changement de salon, démontage...) :
    // sans ça, une valeur `true` restée d'une session précédente (micro
    // activé avant de changer de canal) déclencherait à tort un avertissement
    // "coupé par le modérateur" dès la prochaine connexion, où le micro
    // redémarre pourtant normalement coupé (startAudioOff, voir connect()).
    desiredAudioRef.current = false
  }

  useEffect(() => {
    let cancelled = false

    function refreshParticipants(call: DailyCall) {
      const all = call.participants()
      // Regroupé par joueur (voir selfUserId ci-dessus), PAS par connexion
      // Daily brute : un rechargement de page/app en arrière-plan peut créer
      // une deuxième connexion pour le même joueur avant que Daily ne coupe
      // l'ancienne pour inactivité — sans ce regroupement, ce même joueur
      // apparaissait deux fois dans la liste (retour utilisateur, capture
      // d'écran à l'appui). Clé de regroupement : `userData.uid` (fiable,
      // posé par nos propres clients à la connexion) avec repli sur le nom
      // affiché pour les connexions plus anciennes qui ne le posaient pas
      // encore (déploiement en cours) — jamais le session_id, qui est
      // justement ce qu'on veut arrêter d'utiliser comme identité.
      const byPlayer = new Map<string, VoiceParticipant>()
      for (const p of Object.values(all)) {
        if (p.local) continue
        // Un fantôme qui écoute le village (listenOnly, voir GameRoom.tsx —
        // GhostTabs) rejoint le MÊME salon Daily que les vivants pour pouvoir
        // entendre, mais ne doit jamais apparaître dans la liste des
        // participants affichée aux vivants : retour utilisateur, ça portait
        // à confusion (un joueur déjà éliminé semblait toujours "présent"
        // dans le vocal du village). Marqué côté join() via `userData.ghost`
        // (voir plus bas) — répliqué automatiquement à tous les autres
        // participants par Daily, donc filtrable ici sans aucun aller-retour
        // serveur supplémentaire.
        const userData = p.userData as { uid?: string; ghost?: boolean } | undefined
        if (userData?.ghost) continue
        const name = p.user_name || t('common.playerFallback')
        const key = userData?.uid || name
        const existing = byPlayer.get(key)
        if (existing) {
          existing.audioOn = existing.audioOn || !!p.audio
          existing.sessionIds.push(p.session_id)
        } else {
          byPlayer.set(key, { id: key, name, audioOn: !!p.audio, sessionIds: [p.session_id] })
        }
      }
      setParticipants(Array.from(byPlayer.values()))
      setCanModerate(!!all.local?.owner)

      // Resynchronise `muted` depuis le véritable état Daily du participant
      // LOCAL — et pas seulement depuis nos propres appels à toggleMute
      // (voir desiredAudioRef ci-dessus). C'est ce qui permet à la victime
      // d'un mute à distance par le modérateur de voir son propre état
      // basculer correctement, plutôt que de rester bloquée sur "Actif".
      const audioOn = !!all.local?.audio
      if (!audioOn && desiredAudioRef.current) {
        // On voulait un micro actif, mais il vient de se couper sans qu'on
        // l'ait demandé : ne peut venir que du modérateur (muteParticipant
        // est strictement à sens unique — voir plus bas).
        setForcedMuteNotice(true)
      }
      desiredAudioRef.current = audioOn
      setMuted(!audioOn)
    }

    async function connect() {
      if (!gameId || !code || !channel) return
      if (activeChannelRef.current === channel && callRef.current) return
      await teardown()
      if (cancelled) return

      activeChannelRef.current = channel
      setConnecting(true)
      setError(null)

      try {
        const { url, token: ownerToken } = await getVoiceRoomUrl(gameId, code, channel)
        if (cancelled) return

        const call = DailyIframe.createCallObject({ subscribeToTracksAutomatically: true })
        callRef.current = call

        call.on('participant-joined', () => refreshParticipants(call))
        call.on('participant-updated', () => refreshParticipants(call))
        call.on('participant-left', () => refreshParticipants(call))
        call.on('track-started', (evt) => evt && attachRemoteTrack(evt))
        call.on('track-stopped', (evt) => evt && detachRemoteTrack(evt))
        call.on('remote-participants-audio-level', (evt) => {
          if (!evt) return
          const speaking: string[] = []
          for (const [id, level] of Object.entries(evt.participantsAudioLevel)) {
            if (level > SPEAKING_THRESHOLD) speaking.push(id)
          }
          // Évite un rendu (setSpeakingIds) à chaque tick de l'observateur
          // (par défaut toutes les 300ms) quand le résultat n'a en fait pas
          // changé — silence prolongé la plupart du temps. Un rendu continu
          // en boucle de fond pendant toute la durée du vocal, cumulé au
          // décodage audio WebRTC lui-même, pouvait peser sur des appareils
          // mobiles moins généreux en CPU.
          const signature = speaking.sort().join(',')
          if (signature === speakingSignatureRef.current) return
          speakingSignatureRef.current = signature
          setSpeakingIds(new Set(speaking))
        })
        call.on('local-audio-level', (evt) => {
          if (!evt) return
          setSelfSpeaking(evt.audioLevel > SPEAKING_THRESHOLD)
        })
        call.on('error', (e) => setError(e?.errorMsg ?? t('voiceChat.errorGeneric')))

        // Micro coupé par défaut à l'entrée dans le salon (voir aussi
        // start_audio_off côté room dans api/daily-room.ts) : chacun doit
        // explicitement s'activer pour parler.
        //
        // `token` (string pour l'hôte, absent pour tout le monde d'autre —
        // voir lib/daily.ts) : c'est la propriété `token` de join(), PAS un
        // `?t=` concaténé à l'URL, qui doit porter le jeton "propriétaire"
        // Daily pour un call object.
        //
        // BUG corrigé (régression du correctif précédent) : passer
        // `token: ownerToken ?? undefined` laissait la clé `token` PRÉSENTE
        // dans l'objet avec la valeur `undefined` pour tout non-hôte — Daily
        // valide strictement ses options et rejette ça avec l'erreur
        // "property 'token': token should be...", faisant échouer join() pour
        // tous les joueurs SAUF l'hôte (seul à recevoir un vrai token
        // string). Corrigé en n'incluant la clé `token` que si un jeton
        // existe réellement, via un spread conditionnel.
        await call.join({
          url,
          ...(ownerToken ? { token: ownerToken } : {}),
          // Toujours posé quand on connaît l'identité locale (uid), en plus
          // du marqueur `ghost` pour un fantôme en écoute — voir
          // refreshParticipants ci-dessus, qui s'en sert pour dédupliquer
          // l'affichage et pour exclure les fantômes. Même piège que `token`
          // juste au-dessus (voir le commentaire du BUG corrigé plus bas) :
          // ne jamais poser une clé avec une valeur `undefined` explicite.
          ...(selfUserId || listenOnly
            ? { userData: { ...(selfUserId ? { uid: selfUserId } : {}), ...(listenOnly ? { ghost: true } : {}) } }
            : {}),
          userName: displayName,
          startVideoOff: true,
          startAudioOff: true,
        })
        if (cancelled) {
          await call.leave()
          call.destroy()
          return
        }
        setConnected(true)
        setMuted(true)
        refreshParticipants(call)
        // Démarre l'observation des niveaux sonores distants (voir
        // speakingIds ci-dessus) — sans cet appel explicite, Daily n'émet
        // jamais 'remote-participants-audio-level'.
        try {
          await call.startRemoteParticipantsAudioLevelObserver(500)
        } catch {
          /* pas bloquant : le vocal marche quand même sans le voyant */
        }
        try {
          await call.startLocalAudioLevelObserver(500)
        } catch {
          /* pas bloquant : le vocal marche quand même sans le voyant local */
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('voiceChat.errorConnection'))
      } finally {
        if (!cancelled) setConnecting(false)
      }
    }

    if (channel) {
      connect()
    } else {
      teardown()
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, code, channel, retryToken])

  useEffect(() => {
    return () => {
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Si un salon vocal se connecte automatiquement avant toute interaction de
  // l'utilisateur sur la page, le navigateur peut bloquer la lecture des
  // <audio> distants créés ci-dessus (politique autoplay). On retente à
  // chaque clic/tap n'importe où sur la page jusqu'à ce que ça passe.
  useEffect(() => {
    function retryPendingPlayback() {
      for (const el of remoteAudioElsRef.current.values()) {
        if (el.paused) el.play().catch(() => {})
      }
    }
    document.addEventListener('pointerdown', retryPendingPlayback)
    document.addEventListener('keydown', retryPendingPlayback)
    return () => {
      document.removeEventListener('pointerdown', retryPendingPlayback)
      document.removeEventListener('keydown', retryPendingPlayback)
    }
  }, [])

  // Efface l'avertissement "coupé par le modérateur" tout seul après
  // quelques secondes — pas besoin d'un bouton "fermer" pour un message
  // ponctuel, et il réapparaîtra de toute façon si le modérateur recoupe le
  // micro une nouvelle fois plus tard (voir setForcedMuteNotice(true) plus
  // haut, redéclenché à chaque transition active → coupée non demandée).
  useEffect(() => {
    if (!forcedMuteNotice) return
    const id = setTimeout(() => setForcedMuteNotice(false), 6000)
    return () => clearTimeout(id)
  }, [forcedMuteNotice])

  function toggleMute() {
    if (listenOnly) return // le micro d'un fantôme en écoute n'est jamais publié
    const call = callRef.current
    if (!call) return
    const next = !muted
    // On enregistre ce qu'on vient nous-même de demander AVANT d'appeler
    // Daily (voir desiredAudioRef plus haut) : sinon le 'participant-updated'
    // qui suit immédiatement ce changement pourrait le confondre avec une
    // coupure venue du modérateur. Réactiver son micro ici efface aussi
    // l'avertissement affiché suite à un mute forcé — reprendre la parole
    // vaut confirmation qu'on a bien vu qu'on avait été coupé.
    desiredAudioRef.current = !next
    setForcedMuteNotice(false)
    call.setLocalAudio(!next)
    setMuted(next)
  }

  // Coupe/rétablit ce qu'on ENTEND des autres — n'affecte ni son propre
  // micro, ni la connexion elle-même : juste `.muted` sur chaque <audio>
  // distant déjà posé, et sur ceux à venir (voir attachRemoteTrack, qui lit
  // deafenedRef).
  function toggleSound() {
    const next = !deafenedRef.current
    deafenedRef.current = next
    setDeafened(next)
    for (const el of remoteAudioElsRef.current.values()) {
      el.muted = next
    }
  }

  // Coupe à distance le micro d'un autre joueur. Nécessite d'avoir rejoint
  // le salon avec un jeton "propriétaire" (voir canModerate / api/daily-room.ts) ;
  // sinon Daily ignore silencieusement la demande. Volontairement à sens
  // unique : on ne propose pas de rallumer le micro de quelqu'un d'autre,
  // pour éviter d'activer un micro sans le consentement du joueur.
  //
  // Prend TOUTES les connexions du joueur (voir VoiceParticipant.sessionIds)
  // et pas un seul session_id : depuis la déduplication par joueur, un même
  // joueur peut avoir deux connexions actives en parallèle (rechargement de
  // page pas encore nettoyé côté Daily) — n'en couper qu'une laisserait
  // l'autre continuer à émettre, avec un bouton modérateur qui semble
  // pourtant avoir fonctionné.
  function muteParticipant(sessionIds: string[]) {
    for (const sessionId of sessionIds) {
      callRef.current?.updateParticipant(sessionId, { setAudio: false })
    }
  }

  // Nouvel essai manuel après un échec de connexion (voir retryToken
  // ci-dessus) — évite d'avoir à recharger toute la page pour retenter.
  function retry() {
    setError(null)
    setRetryToken((t) => t + 1)
  }

  return {
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
  }
}
