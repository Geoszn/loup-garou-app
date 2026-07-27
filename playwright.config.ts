import { defineConfig, devices } from '@playwright/test'
import './tests/e2e/env'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'
// On ne démarre nous-mêmes `npm run dev` que pour une cible locale : si
// PLAYWRIGHT_BASE_URL pointe vers un vrai déploiement (preview Vercel,
// staging...), inutile — et faux — d'essayer d'y lancer Vite. Se baser sur
// la seule présence de la variable (plutôt que sur son contenu) ferait
// perdre le démarrage automatique dès qu'elle est renseignée dans
// .env.test avec sa valeur par défaut localhost, ce qui a effectivement
// cassé tous les tests la première fois (webServer jamais lancé, personne
// n'écoutait sur le port).
const usesExternalServer = !!process.env.PLAYWRIGHT_BASE_URL && !/localhost|127\.0\.0\.1/.test(baseURL)

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // La partie multi-joueurs (game-flow.spec.ts) manipule un état de jeu
  // partagé via Supabase : deux tests en parallèle se marcheraient dessus.
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: usesExternalServer
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
