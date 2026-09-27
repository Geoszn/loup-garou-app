import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh])

  return { banners, refresh }
}
