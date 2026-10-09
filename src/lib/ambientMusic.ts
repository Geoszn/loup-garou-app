import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// Musique d'ambiance de l'appli (hors salons et parties) : deux morceaux qui s'enchaînent,
// en fondu, à volume bas. Un seul lecteur persistant (hors de React) pour que la musique
// ne reparte pas à chaque changement de page.
//
// Contraintes des navigateurs / de l'iPhone :
//  * aucun son avant un premier geste de l'utilisateur : on écoute le premier toucher /
//    clic / touche, et c'est lui qui lance la musique ;
//  * sur iPhone, `audio.volume` est ignoré : les fondus passent par un GainNode WebAudio ;
//  * pause quand l'appli passe en arrière-plan.
// ---------------------------------------------------------------------------
const TRACKS = ['/sounds/ambiance-1.mp3', '/sounds/ambiance-2.mp3']
const STORAGE_KEY = 'loup-garou-music-enabled'
const MAX_GAIN = 0.3
const FADE_IN_S = 3
const FADE_OUT_S = 1.2
const TRACK_FADE_S = 4

type AudioCtor = typeof AudioContext

let ctx: AudioContext | null = null
let gain: GainNode | null = null
let el: HTMLAudioElement | null = null
let index = Math.floor(Math.random() * TRACKS.length)
let wantActive = false
let enabled = readEnabled()
let unlocked = false
let playing = false
let fadingOut = false
let initialized = false
let pauseTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

function emit() {
  listeners.forEach((l) => l())
}

function ensureGraph() {
  if (el) return
  el = new Audio()
  el.preload = 'auto'
  el.setAttribute('playsinline', 'true')
  el.src = TRACKS[index]
  el.addEventListener('ended', nextTrack)
  el.addEventListener('timeupdate', onTime)
  try {
    const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
    if (!Ctor) throw new Error('no WebAudio')
    ctx = new Ctor()
    const source = ctx.createMediaElementSource(el)
    gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(gain)
    gain.connect(ctx.destination)
  } catch {
    // Pas de WebAudio : repli sur le volume du lecteur (ignoré sur iPhone, sans fondu là-bas).
    ctx = null
    gain = null
    el.volume = 0
  }
}

function setLevel(target: number, seconds: number) {
  if (gain && ctx) {
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(target, now + Math.max(seconds, 0.05))
  } else if (el) {
    el.volume = target
  }
}

function onTime() {
  if (!el || !playing || fadingOut || !isFinite(el.duration) || el.duration <= 0) return
  const remaining = el.duration - el.currentTime
  if (remaining < TRACK_FADE_S && remaining > 0.2) {
    fadingOut = true
    setLevel(0, remaining - 0.1)
  }
}

function nextTrack() {
  if (!el) return
  index = (index + 1) % TRACKS.length
  fadingOut = false
  el.src = TRACKS[index]
  if (playing) {
    setLevel(0, 0.05)
    void el.play().then(() => setLevel(MAX_GAIN, TRACK_FADE_S)).catch(() => {})
  }
}

function sync() {
  const shouldPlay = wantActive && enabled && unlocked && typeof document !== 'undefined' && document.visibilityState === 'visible'
  if (shouldPlay) {
    ensureGraph()
    if (!el) return
    if (pauseTimer) clearTimeout(pauseTimer)
    pauseTimer = null
    if (playing && !el.paused) return
    playing = true
    void ctx?.resume()
    el.play()
      .then(() => setLevel(MAX_GAIN, fadingOut ? 0.05 : FADE_IN_S))
      .catch(() => {
        // Le navigateur refuse encore (pas de geste valide) : on réessaiera au prochain geste.
        playing = false
        unlocked = false
      })
  } else if (playing) {
    playing = false
    setLevel(0, FADE_OUT_S)
    pauseTimer = setTimeout(() => {
      if (!playing) {
        el?.pause()
        void ctx?.suspend()
      }
    }, FADE_OUT_S * 1000 + 100)
  }
}

function onGesture() {
  if (unlocked) return
  unlocked = true
  sync()
}

/** À appeler une fois au démarrage : écoute le premier geste et l'arrière-plan. */
function init() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  for (const type of ['pointerdown', 'touchend', 'keydown', 'click'] as const) {
    window.addEventListener(type, onGesture, { capture: true, passive: true })
  }
  document.addEventListener('visibilitychange', sync)
}

export const ambientMusic = {
  init,
  /** La musique est-elle autorisée à cet endroit de l'appli (hors salon / partie) ? */
  setActive(on: boolean) {
    wantActive = on
    sync()
  },
  isEnabled: () => enabled,
  setEnabled(on: boolean) {
    enabled = on
    try {
      window.localStorage.setItem(STORAGE_KEY, String(on))
    } catch {
      // Stockage indisponible : le réglage ne sera pas gardé.
    }
    // Le toucher sur le bouton est un geste valide : il suffit à lancer la musique.
    if (on) unlocked = true
    sync()
    emit()
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

/** Réglage « musique d'ambiance » du joueur (activée par défaut), avec son interrupteur. */
export function useAmbientMusicEnabled(): [boolean, () => void] {
  const value = useSyncExternalStore(ambientMusic.subscribe, ambientMusic.isEnabled, () => true)
  return [value, () => ambientMusic.setEnabled(!ambientMusic.isEnabled())]
}
