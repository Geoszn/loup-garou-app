/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // night.* et moon.{200,300} sont pilotés par des variables CSS
        // (voir src/index.css) pour permettre le basculement animé
        // jour/nuit dans GameRoom : mêmes classes Tailwind partout, valeurs
        // différentes selon qu'un ancêtre porte la classe `.theme-day`.
        night: {
          950: 'rgb(var(--c-night-950) / <alpha-value>)',
          900: 'rgb(var(--c-night-900) / <alpha-value>)',
          800: 'rgb(var(--c-night-800) / <alpha-value>)',
          700: 'rgb(var(--c-night-700) / <alpha-value>)',
          600: 'rgb(var(--c-night-600) / <alpha-value>)',
          500: 'rgb(var(--c-night-500) / <alpha-value>)',
        },
        blood: {
          // Réchauffés vers la terre cuite/rouille (textiles, masques)
          // plutôt que le rouge-rose froid d'origine.
          400: '#e0623f',
          500: '#c2432a',
          600: '#9c331f',
          700: '#761f14',
        },
        moon: {
          200: 'rgb(var(--c-moon-200) / <alpha-value>)',
          300: 'rgb(var(--c-moon-300) / <alpha-value>)',
          400: '#e0a84a',
        },
      },
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        // Réservée aux bandeaux "parchemin déchiré" des cartes de rôle,
        // pour imiter le lettrage à la main des cartes de référence — pas
        // utilisée ailleurs pour ne pas alourdir la lecture du reste de
        // l'appli.
        banner: ['"Kalam"', 'cursive'],
      },
      backgroundImage: {
        'radial-fade': 'radial-gradient(circle at top, rgba(51,65,96,0.35), transparent 60%)',
        'forest-vignette': 'linear-gradient(180deg, rgba(5,7,13,0.2) 0%, rgba(5,7,13,0.9) 100%)',
      },
      boxShadow: {
        glow: '0 0 25px rgba(236,207,125,0.25)',
        'blood-glow': '0 0 25px rgba(198,46,66,0.35)',
        // Ombres à couches multiples (liseré + contact + halo large) pour
        // donner du relief aux boutons/cartes vedettes plutôt qu'un aplat.
        'gold-btn': '0 1px 0 0 rgba(255,255,255,0.5) inset, 0 4px 12px -2px rgba(236,207,125,0.4)',
        'blood-btn': '0 1px 0 0 rgba(255,255,255,0.15) inset, 0 4px 16px -2px rgba(224,69,90,0.45)',
        tarot: '0 0 0 1px rgba(236,207,125,0.15), 0 8px 24px -4px rgba(0,0,0,0.8), 0 0 48px -8px rgba(236,207,125,0.25)',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.04)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'flip-card': {
          '0%': { transform: 'rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        // Duo utilisé par les popups (ConfirmDialog, VoteRecapModal, panneau
        // de modération) : le fond s'estompe pendant que la carte elle-même
        // apparaît avec un léger effet de rapprochement, plutôt que de
        // surgir instantanément à l'écran.
        'overlay-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        // Tiroir latéral (SideDrawer, voir ui.tsx) : glisse depuis le bord
        // droit de l'écran plutôt que de surgir depuis le centre comme les
        // modales, pour bien marquer que c'est un panneau annexe et non une
        // interruption bloquante de la page.
        'drawer-in': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        breathe: 'breathe 4s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out',
        'flip-card': 'flip-card 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'overlay-in': 'overlay-in 0.2s ease-out',
        'modal-in': 'modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'drawer-in': 'drawer-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
