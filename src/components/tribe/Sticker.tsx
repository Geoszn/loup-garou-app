import { memo } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import type { StickerDef } from '../../lib/stickers'
import { Avatar } from '../Avatar'

const OUT = '#2b1a10'
// Contour blanc « autocollant » + ombre douce.
const DIE = 'drop-shadow(2.5px 0 0 #fff) drop-shadow(-2.5px 0 0 #fff) drop-shadow(0 2.5px 0 #fff) drop-shadow(0 -2.5px 0 #fff) drop-shadow(0 4px 5px rgba(0,0,0,.45))'

/**
 * Un sticker du pack « Moi » : l'avatar de l'expéditeur dans son rond, avec l'humeur du
 * sticker, un accessoire et une légende sur un bandeau. `size` est la largeur en pixels
 * (tout est proportionnel).
 */
export const Sticker = memo(function Sticker({ def, avatarConfig, avatarIcon, name, size = 96 }: { def: StickerDef; avatarConfig?: unknown; avatarIcon?: string | null; name?: string; size?: number }) {
  const { t } = useLanguage()
  const k = size / 86
  return (
    <div className="relative shrink-0" style={{ filter: DIE, width: size, height: size }} role="img" aria-label={t(def.label)}>
      <div className="absolute overflow-hidden rounded-full bg-night-800" style={{ left: 8 * k, top: 0, width: 70 * k, height: 70 * k }}>
        <Avatar config={avatarConfig} icon={avatarIcon} name={name} mood={def.mood} className="h-full w-full" />
      </div>
      <span style={{ position: 'absolute', right: -2 * k, top: -4 * k, fontSize: 26 * k, lineHeight: 1 }}>{def.prop}</span>
      <span
        className="text-center font-display font-bold uppercase text-white"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, transform: 'rotate(-3deg)', fontSize: 12 * k, lineHeight: 1.1, padding: `${2 * k}px ${4 * k}px`, borderRadius: 8 * k, background: def.color, border: `${2 * k}px solid ${OUT}`, whiteSpace: 'nowrap' }}
      >
        {t(def.label)}
      </span>
    </div>
  )
})
