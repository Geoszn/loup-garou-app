import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { homeSection } from '../lib/homeBootstrap'
import type { Banner } from '../types/banners'

/** Bannières actives (voir migration 0202), même principe de polling que
 * useActiveEvents — utilisé par PromoCarousel sur Dashboard.tsx. */
export function useActiveBanners() {
  const [banners, setBanners] = useState<Banner[]>([])

  const refresh = useCallback(() => {
    supabase.rpc('get_active_banners').then(({ data }) => {
      if (data) setBanners(data as Banner[])
    })
  }, [])

  useEffect(() => {
    homeSection<Banner[]>('banners', async () => (await supabase.rpc('get_active_banners')).data as Banner[] | null).then((data) => {
      if (data) setBanners(data)
    })
    const interval = setInterval(() => {
      if (!document.hidden) refresh()
    }, 60000)
    return () => clearInterval(interval)
  }, [refresh])

  return { banners, refresh }
}
