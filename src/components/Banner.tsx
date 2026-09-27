import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { supabase } from '../lib/supabase'
import type { Banner as BannerData } from '../types/banners'

/** Bannière simple (voir migration 0202) : juste une image, éventuellement
 * cliquable si link_url est configuré — un lien commençant par "/" navigue
 * en interne (SPA, pas de rechargement de page), tout le reste s'ouvre dans
 * un nouvel onglet (site externe). Contrairement à EventBanner, aucun texte
 * superposé, aucun bonus, aucun compte à rebours : le visuel porte tout. */
export function Banner({ banner }: { banner: BannerData }) {
  const { lang } = useLanguage()
  const navigate = useNavigate()

  const imagePath = (lang === 'en' ? banner.image_path_en : banner.image_path) || banner.image_path || banner.image_path_en
  const imageUrl = imagePath ? supabase.storage.from('event-banners').getPublicUrl(imagePath).data.publicUrl : null
  if (!imageUrl) return null

  const clickable = !!banner.link_url

  function handleClick() {
    if (!banner.link_url) return
    if (banner.link_url.startsWith('/')) navigate(banner.link_url)
    else window.open(banner.link_url, '_blank', 'noopener,noreferrer')
  }

  const image = <img src={imageUrl} alt="" className="aspect-[3/1] w-full rounded-2xl object-cover object-center" />

  if (!clickable) return <div className="mb-4 overflow-hidden rounded-2xl">{image}</div>

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mb-4 block w-full overflow-hidden rounded-2xl transition-opacity hover:opacity-90"
    >
      {image}
    </button>
  )
}
