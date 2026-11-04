// Petits utilitaires de couleur partagés par le dessin des avatars (AvatarArt.tsx, avatarFace.tsx).
export function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const toHex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
/** Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur. */
export const shade = (hex: string, amt: number) => toHex(toRgb(hex).map((v) => v + amt))
/** Mélange deux couleurs (t = 0 → a, t = 1 → b). */
export const mix = (a: string, b: string, t: number) => {
  const A = toRgb(a)
  const B = toRgb(b)
  return toHex(A.map((v, i) => v + (B[i] - v) * t))
}
