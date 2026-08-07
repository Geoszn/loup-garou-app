#!/bin/bash
# Double-clique sur ce fichier dans le Finder pour envoyer le commit déjà
# préparé (Enfant Sauvage, succession aléatoire du Capitaine, contenu/cartes
# éditables depuis l'admin, domaine admin dédié) vers GitHub. Vercel est
# connecté à ce dépôt et redéploiera automatiquement le site web dès
# réception du push — pas besoin de relancer quoi que ce soit d'autre côté
# web.
cd "$(dirname "$0")"
echo "=== git push origin main ==="
git push origin main
echo ""
echo "Terminé. Vercel va redéployer automatiquement le site (à suivre sur vercel.com)."
read -p "Appuie sur Entrée pour fermer..."
