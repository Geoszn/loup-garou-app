import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. Copiez .env.example vers .env et renseignez vos clés Supabase.'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
