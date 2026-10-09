/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Dictionnaires générés par le plugin i18nSplit (vite.config.ts) : une chaîne par clé de traduction.
declare module 'virtual:i18n-fr' {
  const dictionary: Record<string, string>
  export default dictionary
}
declare module 'virtual:i18n-en' {
  const dictionary: Record<string, string>
  export default dictionary
}
