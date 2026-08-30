#!/bin/bash
# Double-clique sur ce fichier pour déployer la compression des images
# (cartes de rôle + bannières d'événement) avant upload — pas de migration
# SQL (client uniquement) :
#   1. Vérifie le code (TypeScript + grants RPC + build).
#   2. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Compression des images uploadées — déploiement"
echo "==========================================="
echo

echo "→ Vérification TypeScript..."
npx tsc -b

echo
echo "→ Vérification des grants RPC..."
npm run check:rpc

echo
echo "→ Build de production..."
npm run build

echo
echo "→ Fichiers modifiés :"
git status --short

CHANGES=$(git status --porcelain)
if [ -z "$CHANGES" ]; then
  echo
  echo "Aucun changement de code à pousser."
else
  echo
  read -p "Message de commit (laisse vide pour un message automatique) : " msg
  if [ -z "$msg" ]; then
    msg="Compresse les images de cartes de rôle et bannières avant l'upload (moins de poids pour chaque joueur)"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "→ Envoi vers GitHub (Vercel va redéployer automatiquement)..."
  git push
fi

echo
echo "✅ Terminé. Vercel reconstruit le site — 1 à 2 minutes."
echo
echo "N'oublie pas : recharge complètement la page/l'appli avant de tester"
echo "(pas juste revenir dans l'onglet) pour être sûr d'avoir le nouveau code."
echo
echo "À tester (tableau de bord admin) :"
echo "  - Uploader une image de carte de rôle (idéalement une grosse photo, plusieurs Mo) :"
echo "    l'aperçu doit rester net, et le fichier réellement stocké doit être bien plus léger"
echo "    (redimensionné à 900×1350 max, converti en JPEG qualité 82%)."
echo "  - Même test pour une bannière d'événement (redimensionnée à 1600×533 max, ratio 3:1)."
echo "  - Vérifier que l'image reste nette et bien cadrée dans le jeu / le tableau de bord."
echo "  - Si le navigateur ne supporte pas la compression (rare) : l'upload doit quand même"
echo "    fonctionner avec le fichier original, sans erreur bloquante."
echo
read -p "Appuie sur Entrée pour fermer..."
