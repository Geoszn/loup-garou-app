import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Le dictionnaire (src/i18n/translations.ts) reste UN seul fichier à éditer, avec fr et en côte à
// côte pour chaque clé. Au build, il est découpé en deux modules virtuels (un par langue) : le
// joueur ne télécharge que sa langue, l'autre n'arrive que s'il change de langue.
function i18nSplit(): Plugin {
  const source = resolve(__dirname, 'src/i18n/translations.ts')
  const prefix = 'virtual:i18n-'
  async function dictionary(lang: string): Promise<string> {
    const compiled = await transformWithEsbuild(readFileSync(source, 'utf8'), source, { loader: 'ts', format: 'esm' })
    const mod = (await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`)) as {
      translations: Record<string, Record<string, string>>
    }
    const flat: Record<string, string> = {}
    for (const [key, entry] of Object.entries(mod.translations)) flat[key] = entry[lang]
    return `export default ${JSON.stringify(flat)}`
  }
  return {
    name: 'i18n-split',
    resolveId: (id) => (id === `${prefix}fr` || id === `${prefix}en` ? `\0${id}` : null),
    async load(id) {
      if (!id.startsWith(`\0${prefix}`)) return null
      this.addWatchFile(source)
      return dictionary(id.slice(`\0${prefix}`.length))
    },
  }
}

// Deux points d'entrée : le site public (index.html) et l'administration
// (admin.html, servie uniquement sur le sous-domaine admin — voir
// vercel.json). Ainsi, le code du site public ne référence ni le dashboard
// admin, ni son nom de domaine.
export default defineConfig({
  plugins: [react(), i18nSplit()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
      },
    },
  },
})
