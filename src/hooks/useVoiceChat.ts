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
  id: string
  name: string
  audioOn: boolean
}

export function useVoiceChat(
  gameId: string | null,
  code: string | null,
  channel: VoiceChannel,
  displayName: string,
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
  // Diagnostic TEMPORAIRE (à retirer une fois le bug "connecté mais aucun
  // son" résolu en natif iOS) : affiché directement dans VoiceChat.tsx pour
  // pouvoir être lu sur un screenshot du joueur, faute d'accès à la console
  // JS (Safari Web Inspector non pilotable à distance dans ce contexte).
  // Capture l'état réel de la piste micro locale (readyState/muted/enabled)
  // et le nombre de pistes distantes effectivement reçues, pour distinguer
  // "la connexion WebRTC ne transporte aucune piste" de "les pistes
  // arrivent mais sans son".
  const [debugInfo, setDebugInfo] = useState('')
  const remoteTrackEventsRef = useRef(0)
  const playBlockedRef = useRef(false)
  const debugIntervalRef = useRef<number | null>(null)

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

    remoteTrackEventsRef.current += 1

    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    audioEl.hidden = true
    audioEl.muted = deafenedRef.current
    audioEl.srcObject = new MediaStream([evt.track])
    document.body.appendChild(audioEl)
    remoteAudioElsRef.current.set(trackId, audioEl)
    audioEl.play()
      .then(() => updateDebugInfo())
      .catch(() => {
        // Bloqué par la politique autoplay du navigateur (pas encore
        // d'interaction utilisateur sur la page) : on retentera au prochain
        // clic, la balise reste posée et prête.
        playBlockedRef.current = true
        updateDebugInfo()
      })
    updateDebugInfo()
  }

  // Diagnostic TEMPORAIRE (voir déclaration de debugInfo plus haut) : lit
  // l'état réel (pas juste ce que notre propre state React croit) de la
  // piste micro locale exposée par Daily, plus le décompte de pistes
  // distantes reçues et un éventuel blocage de lecture autoplay.
  function updateDebugInfo() {
    const call = callRef.current
    if (!call) return
    try {
      const local = call.participants().local
      const audioTrack = local?.tracks?.audio
      const rawTrack = audioTrack?.persistentTrack ?? audioTrack?.track
      const parts = [
        `micro local: état="${audioTrack?.state ?? '?'}" abonné=${audioTrack?.subscribed ?? '?'}`,
        rawTrack
          ? `piste brute: readyState=${rawTrack.readyState} enabled=${rawTrack.enabled} muted=${rawTrack.muted}`
          : 'piste brute: absente',
        `pistes distantes reçues: ${remoteTrackEventsRef.current} (éléments audio actifs: ${remoteAudioElsRef.current.size})`,
        playBlockedRef.current ? 'lecture autoplay: BLOQUÉE' : 'lecture autoplay: ok',
      ]
      setDebugInfo(parts.join(' • '))
    } catch (e) {
      setDebugInfo(`diag erreur: ${e instanceof Error ? e.message : String(e)}`)
    }
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
    if (debugIntervalRef.current !== null) {
      window.clearInterval(debugIntervalRef.current)
      debugIntervalRef.current = null
    }
    remoteTrackEventsRef.current = 0
    playBlockedRef.current = false
    setDebugInfo('')
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
  }

  useEffect(() => {
    let cancelled = false

    function refreshParticipants(call: DailyCall) {
      const all = call.participants()
      const list: VoiceParticipant[] = Object.values(all)
        .filter((p) => !p.local)
        .map((p) => ({ id: p.session_id, name: p.user_name || t('common.playerFallback'), audioOn: !!p.audio }))
      setParticipants(list)
      setCanModerate(!!all.local?.owner)
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
        const url = await getVoiceRoomUrl(gameId, code, channel)
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
        await call.join({ url, userName: displayName, startVideoOff: true, startAudioOff: true })
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
        updateDebugInfo()
        debugIntervalRef.current = window.setInterval(updateDebugInfo, 1000)
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

  function toggleMute() {
    if (listenOnly) return // le micro d'un fantôme en écoute n'est jamais publié
    const call = callRef.current
    if (!call) return
    const next = !muted
    call.setLocalAudio(!next)
    setMuted(next)
    setTimeout(updateDebugInfo, 300)
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
  function muteParticipant(sessionId: string) {
    callRef.current?.updateParticipant(sessionId, { setAudio: false })
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
    debugInfo,
  }
}
