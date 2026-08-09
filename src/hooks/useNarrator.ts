import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchNarratorAudio } from '../lib/narratorVoice'

const STORAGE_KEY = 'loup-garou-narrator-enabled'
// Wav silencieux valide (8 échantillons à zéro, vérifié octet par octet),
// utilisé uniquement pour "débloquer" la lecture audio programmatique sur
// Safari/iOS avant la première vraie annonce.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA=='

function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function cleanForSpeech(message: string): string {
  // Retire les émojis pour une lecture plus naturelle par la synthèse vocale.
  return message
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Fait annoncer à voix haute chaque nouvel événement public de la partie
 * (nuit qui tombe, vote qui s'ouvre, morts révélées, victoire...). Ne lit
 * jamais les rôles secrets : elle se contente des messages du journal de
 * partie, qui ne contient par construction que des informations publiques.
 *
 * Deux moteurs de voix, dans cet ordre :
 *   1. ElevenLabs (voix IA réaliste) via la fonction serverless
 *      /api/narrator-voice, si configurée côté serveur.
 *   2. En repli silencieux — clé absente, quota gratuit mensuel épuisé,
 *      panne réseau — la synthèse vocale gratuite du navigateur.
 * Les annonces sont mises en file pour ne jamais se chevaucher.
 *
 * Piège navigateur important : les annonces sont déclenchées par un
 * événement Realtime asynchrone (jamais directement par un clic). Safari
 * exige qu'un premier son (synthèse vocale OU lecture audio) ait été
 * déclenché en réaction directe à un geste utilisateur avant d'accepter
 * d'en produire par la suite — sinon les appels ultérieurs échouent
 * silencieusement. On "déverrouille" donc les deux moteurs dès le tout
 * premier clic/tap sur la page de jeu, quel qu'il soit.
 */
// Coupure générale de la fonctionnalité : mise à `false` pour économiser
// les ressources qu'elle consomme en continu pour chaque joueur en partie
// (un canal Supabase Realtime dédié ouvert par joueur, en plus des canaux
// déjà utilisés par la partie elle-même, + des appels réseau à l'API
// ElevenLabs à chaque événement du journal). `supported` devient donc
// toujours `false` : ça coupe net l'abonnement Realtime plus bas (l'effet
// correspondant sort immédiatement si `!supported`), les écouteurs de
// "déverrouillage" audio, et masque automatiquement le bouton "Tester le
// narrateur" du tableau de bord ainsi que le toggle dans le menu en partie
// (tous deux conditionnés par `narrator.supported`) — sans supprimer le
// reste du code. Pour réactiver la fonctionnalité plus tard, repasser cette
// constante à `true`.
const NARRATOR_FEATURE_ENABLED = false

export function useNarrator(gameId: string | null) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  })
  const [supported] = useState(
    NARRATOR_FEATURE_ENABLED &&
      typeof window !== 'undefined' &&
      (typeof Audio !== 'undefined' || speechSupported())
  )
  const enabledRef = useRef(enabled)
  const gameIdRef = useRef(gameId)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const readyRef = useRef(false)
  const unlockedRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)
  // Un seul et même élément <audio>, réutilisé pour toutes les annonces.
  // Important sur Safari/iOS : le "déverrouillage" par geste utilisateur ne
  // s'applique qu'à l'instance d'élément précise qui a servi au tout premier
  // play() réussi — en créer un nouveau (`new Audio()`) à chaque annonce
  // perd ce déverrouillage et redevient bloqué en silence sur mobile, même
  // si ça continue de fonctionner sur ordinateur.
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  gameIdRef.current = gameId

  function getAudioEl(): HTMLAudioElement {
    if (!audioElRef.current) {
      const el = document.createElement('audio')
      // Positionné hors écran plutôt que `hidden` (display:none) : quelques
      // navigateurs mobiles plus anciens traitent différemment la lecture
      // d'éléments médias qui n'ont jamais de boîte de rendu du tout — hors
      // écran garde un élément "réel" tout en restant invisible.
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      el.style.width = '1px'
      el.style.height = '1px'
      el.setAttribute('playsinline', 'true')
      document.body.appendChild(el)
      audioElRef.current = el
    }
    return audioElRef.current
  }

  // Renvoie une promesse résolue à true si le déverrouillage a réussi (ou
  // était déjà acquis), false sinon — pour que les appelants (testVoice en
  // particulier) puissent attendre la fin réelle du geste avant d'enchaîner,
  // au lieu de lancer unlock() "à l'aveugle" en parallèle de la lecture.
  function unlock(): Promise<boolean> {
    if (unlockedRef.current) return Promise.resolve(true)
    // Important : on ne marque "déverrouillé" qu'une fois le play() confirmé
    // réussi, jamais avant. Sur certains mobiles (notamment les WebView
    // d'appli de messagerie), le tout premier essai peut légitimement
    // échouer ; comme les écouteurs ci-dessous ne sont plus en `once`, un
    // échec ici retente simplement au geste suivant au lieu de rester
    // bloqué en silence pour le reste de la partie.
    if (speechSupported()) {
      // On repart d'une file vide : sur certains navigateurs, une synthèse
      // laissée en attente bloque silencieusement tous les appels suivants.
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      window.speechSynthesis.speak(u)
    }
    try {
      const el = getAudioEl()
      el.volume = 0
      el.src = SILENT_WAV
      return el
        .play()
        .then(() => {
          el.volume = 1
          unlockedRef.current = true
          return true
        })
        .catch((err) => {
          console.warn('[narrateur] déverrouillage audio impossible, nouvel essai au prochain geste :', err)
          return false
        })
    } catch (err) {
      console.warn('[narrateur] déverrouillage audio impossible, nouvel essai au prochain geste :', err)
      return Promise.resolve(false)
    }
  }

  // Résout à true si la synthèse a effectivement démarré (onstart déclenché
  // avant la fin), false sinon — pour que playText sache si le repli
  // navigateur a réellement produit un son ou a lui aussi échoué en
  // silence (cas fréquent sur mobile : la voix ne se déclenche jamais alors
  // que la promesse se résout quand même).
  function speakBrowser(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!speechSupported() || !text) {
        resolve(false)
        return
      }
      // Repart toujours d'une file propre avant de parler : évite qu'une
      // synthèse précédente restée bloquée n'empêche celle-ci de démarrer.
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'fr-FR'
      utterance.rate = 0.95
      if (voiceRef.current) utterance.voice = voiceRef.current
      let started = false
      utterance.onstart = () => {
        started = true
      }
      utterance.onend = () => resolve(started)
      utterance.onerror = (e) => {
        console.warn('[narrateur] échec voix navigateur :', e.error)
        resolve(false)
      }
      window.speechSynthesis.speak(utterance)
    })
  }

  function playBlob(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = getAudioEl()
      audio.volume = 1
      const url = URL.createObjectURL(blob)
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        URL.revokeObjectURL(url)
        ok ? resolve() : reject(new Error('Lecture audio impossible.'))
      }
      const onEnded = () => finish(true)
      const onError = () => finish(false)
      audio.addEventListener('ended', onEnded, { once: true })
      audio.addEventListener('error', onError, { once: true })
      audio.src = url
      audio.play().catch(() => finish(false))
      // Filet de sécurité : si l'audio ne se termine jamais (réseau capricieux,
      // événement manqué), on ne bloque pas la file plus de 20s.
      setTimeout(() => finish(false), 20000)
    })
  }

  // Renvoie true si une voix a effectivement été jouée (IA ou navigateur),
  // false si tout a échoué — pour que testVoice() puisse signaler un vrai
  // échec plutôt que de laisser croire silencieusement que ça a marché.
  //
  // Bug corrigé ici : cette fonction ne tentait ElevenLabs que si
  // `gameIdRef.current` était vrai — or le bouton "Tester le narrateur" du
  // tableau de bord appelle exactement ce chemin AVANT de rejoindre une
  // partie, donc avec gameId = null. Le serveur accepte pourtant très bien
  // un gameId absent (voir fetchNarratorAudio) : ce test ne passait donc
  // jamais par la vraie voix ElevenLabs et se rabattait toujours, sans le
  // dire, sur la voix du navigateur — nettement moins fiable sur mobile.
  async function playText(text: string): Promise<boolean> {
    if (!text) return false
    try {
      const blob = await fetchNarratorAudio(gameIdRef.current, text)
      await playBlob(blob)
      return true
    } catch (err) {
      // Voix IA indisponible (quota, clé absente, réseau) : repli sur la
      // voix du navigateur ci-dessous.
      console.warn('[narrateur] voix ElevenLabs indisponible, repli navigateur :', err)
    }
    return speakBrowser(text)
  }

  async function processQueue() {
    if (processingRef.current) return
    processingRef.current = true
    while (queueRef.current.length > 0) {
      if (!enabledRef.current) {
        queueRef.current = []
        break
      }
      const next = queueRef.current.shift() as string
      await playText(next)
    }
    processingRef.current = false
  }

  function enqueue(text: string) {
    if (!text) return
    queueRef.current.push(text)
    void processQueue()
  }

  function stopAll() {
    queueRef.current = []
    if (audioElRef.current) audioElRef.current.pause()
    if (speechSupported()) window.speechSynthesis.cancel()
  }

  // Déverrouille dès la première interaction de l'utilisateur avec la page
  // (peu importe où il clique/tape), pour que les annonces automatiques
  // déclenchées plus tard par les événements de partie fonctionnent.
  useEffect(() => {
    if (!supported) return
    // Pas de `once: true` ici : unlock() se ré-exécute à chaque geste tant
    // qu'il n'a pas réussi (il se protège lui-même via unlockedRef une fois
    // le déverrouillage confirmé), ce qui permet de rattraper un premier
    // essai raté sur mobile. `touchstart` est ajouté en plus de `pointerdown`
    // pour couvrir les WebView mobiles qui ne déclenchent pas toujours les
    // Pointer Events.
    const opts = { capture: true } as const
    document.addEventListener('pointerdown', unlock, opts)
    document.addEventListener('touchstart', unlock, opts)
    document.addEventListener('keydown', unlock, opts)
    return () => {
      document.removeEventListener('pointerdown', unlock, opts)
      document.removeEventListener('touchstart', unlock, opts)
      document.removeEventListener('keydown', unlock, opts)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  // Retire l'élément <audio> persistant du DOM au démontage complet du hook.
  useEffect(() => {
    return () => {
      if (audioElRef.current) {
        audioElRef.current.pause()
        audioElRef.current.remove()
        audioElRef.current = null
      }
    }
  }, [])

  // Contourne un bug connu de Chrome/Edge où la file d'attente de synthèse
  // vocale du navigateur (repli) se fige silencieusement après ~15s
  // d'inactivité : on la réveille périodiquement tant qu'elle parle.
  useEffect(() => {
    if (!speechSupported()) return
    const interval = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      }
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  // Joue une phrase de test à la demande (bouton "Tester le narrateur"),
  // indépendamment de la partie en cours et du toggle activé/désactivé — un
  // clic sur ce bouton est en soi une demande explicite d'entendre la voix,
  // même si la narration automatique est coupée par ailleurs. Passe aussi
  // par unlock() : cliquer ce bouton en tout début de session sert du même
  // coup à débloquer l'audio pour le reste de la partie sur Safari/iOS.
  //
  // On attend maintenant la fin réelle de unlock() avant d'enchaîner (au
  // lieu de le lancer en "tir et oublie" en parallèle de playText), et on
  // lève une erreur explicite si rien n'a pu être joué — jusqu'ici un échec
  // total (ElevenLabs ET voix navigateur) restait totalement silencieux,
  // sans aucun moyen de savoir que quelque chose s'était mal passé.
  const testVoice = useCallback(async (text = 'Ceci est un test de la voix du narrateur.') => {
    await unlock()
    const played = await playText(text)
    if (!played) {
      throw new Error(
        "Aucune voix n'a pu être jouée sur cet appareil (audio bloqué par le navigateur ou voix indisponible)."
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v
      stopAll()
      if (next) {
        // Ce clic est un vrai geste utilisateur : on en profite pour
        // (re)tenter un déverrouillage réel plutôt que de marquer
        // `unlockedRef` à true sans preuve — un faux positif ici empêcherait
        // tout nouvel essai plus tard si le tout premier avait en fait
        // échoué silencieusement.
        void unlock()
        enqueue('Narrateur activé.')
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    enabledRef.current = enabled
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(enabled))
    if (!enabled) stopAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    if (!speechSupported()) return
    function pickVoice() {
      const voices = window.speechSynthesis.getVoices()
      voiceRef.current = voices.find((v) => v.lang.toLowerCase().startsWith('fr')) ?? voices[0] ?? null
    }
    pickVoice()
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickVoice)
  }, [])

  useEffect(() => {
    if (!supported || !gameId) return
    readyRef.current = false

    // Petit délai avant d'activer la narration : le temps que le journal déjà
    // existant se charge ailleurs dans l'appli, pour ne pas tout relire d'un
    // coup en arrivant dans la partie.
    const readyTimeout = setTimeout(() => {
      readyRef.current = true
    }, 1200)

    const sub = supabase
      .channel(`narrator-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_log', filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (!readyRef.current || !enabledRef.current) return
          const message = (payload.new as { message: string }).message
          enqueue(cleanForSpeech(message))
        }
      )
      .subscribe()

    return () => {
      clearTimeout(readyTimeout)
      supabase.removeChannel(sub)
      stopAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, supported])

  return { enabled, setEnabled, toggle, supported, testVoice, stop: stopAll }
}
