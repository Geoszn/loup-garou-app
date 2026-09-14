#!/bin/bash
# Double-clique sur ce fichier pour déployer un petit ornement décoratif
# entre le classement et le reste du bas du tableau de bord :
#   1. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build). Pas de migration SQL — purement front-end.
#   2. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - Entre la fin de la carte "Classement" et le lien "Donner mon avis" du
#    tableau de bord, l'espace était vide et laissait la transition entre
#    les deux cartes aux bords nets (Classement, puis plus bas la carte
#    Citation) paraître rigide/décousue plutôt que fluide.
#  - Nouveau composant réutilisable SectionDivider (ui.tsx) : un liseré doré
#    dégradé de chaque côté d'un petit glyphe ☾ centré, repris du même
#    vocabulaire visuel que les liserés déjà utilisés en haut/bas de la
#    carte Citation (QuoteCarousel) — purement décoratif (aria-hidden).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Ornement décoratif sous le classement du tableau de bord"
echo "==========================================="
echo

echo "→ Vérification TypeScript..."
npx tsc -b

echo
echo "→ Vérification des grants RPC..."
npm run check:rpc

echo
echo "→ Vérification des champs de get_my_game_view..."
npm run check:game-view

echo
echo "→ Build de production..."
npm run build

echo
echo "→ Préparation du commit"
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
    msg="Ajoute un ornement décoratif entre le classement et le bas du tableau de bord"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "✅ Commit créé localement. Dernière étape, à faire toi-même (copie/colle) :"
  echo
  echo "     git push"
  echo
  echo "   (Vercel redéploiera automatiquement une fois envoyé sur GitHub.)"
fi

echo
echo "À tester une fois déployé :"
echo "  - Tableau de bord : entre la carte Classement et le lien 'Donner mon"
echo "    avis', un petit liseré doré avec un croissant de lune ☾ centré doit"
echo "    apparaître, sur mobile comme sur desktop."
echo

read -p "Appuie sur Entrée pour fermer..."
