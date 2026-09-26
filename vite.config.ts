import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deux points d'entrée : le site public (index.html) et l'administration
// (admin.html, servie uniquement sur le sous-domaine admin — voir
// vercel.json). Ainsi, le code du site public ne référence ni le dashboard
// admin, ni son nom de domaine.
export default defineConfig({
  plugins: [react()],
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
