// Bannières administrées depuis le dashboard admin (voir migration 0202,
// onglet "Événements & Bannières") — une image cliquable simple, sans bonus
// de jeu ni texte superposé, contrairement à un événement (GameEvent). Le
// clic ouvre link_url si renseigné (site externe ou page interne).
export interface Banner {
  id: string
  image_path: string | null
  // Image spécifique au public anglophone, même principe que
  // GameEvent.banner_image_path_en — null = repli sur image_path.
  image_path_en: string | null
  link_url: string | null
  // Durée d'affichage dans le carrousel du tableau de bord (secondes).
  display_seconds: number
}
