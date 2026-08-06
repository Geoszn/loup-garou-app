// Petit module partagé (plutôt qu'une constante dupliquée dans App.tsx et
// Login.tsx) : le sous-domaine dédié au dashboard admin (voir App.tsx et la
// migration DNS chez le registrar). Extrait ici pour que Login.tsx puisse
// aussi l'utiliser sans créer d'import circulaire avec App.tsx (qui charge
// Login en lazy).
export const ADMIN_HOSTNAME = 'admin.loupgarouafrique.com'
export const isAdminHost = typeof window !== 'undefined' && window.location.hostname === ADMIN_HOSTNAME
