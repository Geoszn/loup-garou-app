#!/bin/bash
# Double-clique sur ce fichier pour déployer le correctif de défilement des
# pop-ups (Modal) — pas de migration SQL (client uniquement) :
#   1. Vérifie le code (TypeScript + grants RPC + build).
#   2. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Correctif défilement des pop-ups — déploiement"
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
    msg="Corrige le défilement bloqué des pop-ups longues (panneau de modération) : le glissement pour fermer ne se déclenche plus que depuis la poignée"
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
echo "À tester :"
echo "  - En pleine partie avec plusieurs joueurs, ouvrir le panneau de modération (menu ⋮) :"
echo "    on doit pouvoir défiler jusqu'en bas (section 'Recommencer la partie' visible)."
echo "  - Glisser vers le bas depuis la petite poignée en haut : la pop-up se ferme toujours."
echo "  - Glisser vers le bas depuis le CONTENU (liste de joueurs, mots bloqués) : ça défile, ça ne ferme plus la pop-up."
echo "  - Le bouton ✕ en haut à droite ferme toujours normalement au clic/tap."
echo
read -p "Appuie sur Entrée pour fermer..."
