#!/bin/bash
# Double-clique sur ce fichier pour déployer ce correctif :
#   1. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build). Aucune migration SQL cette fois — la
#      fonction transfer_host (migration 0160) est déjà en place côté
#      Supabase, seul l'endroit d'où on l'appelle change.
#   2. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu : retour utilisateur — le transfert d'hôte demandait d'abord
# d'ouvrir le panneau de modération ("aller dans les réglages et tout
# tralala"). Déplacé directement dans la fiche joueur qui s'ouvre déjà en
# tapant sur un joueur dans le salon d'attente : un bouton "👑 Transférer
# l'hôte" apparaît sous "Ajouter en ami" (uniquement pour l'hôte, sur un
# autre joueur, jamais un bot), avec la même pop-up de confirmation
# qu'avant le transfert effectif. Retiré du panneau de modération, qui ne
# portait que ça pour ce geste.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Transfert d'hôte : déplacé vers la fiche joueur"
echo "==========================================="
echo

echo "→ Étape 1/2 : vérification du code"
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
echo "→ Étape 2/2 : préparation du commit"
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
    msg="Déplace le transfert d'hôte vers la fiche joueur du salon d'attente"
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
echo "  - Salon d'attente, en tant qu'hôte : tape sur un autre joueur (pas un"
echo "    bot) dans la liste → la fiche doit montrer un bouton '👑 Transférer"
echo "    l'hôte' sous 'Ajouter en ami'."
echo "  - Cliquer dessus doit ouvrir une pop-up de confirmation nommant le"
echo "    joueur ; Annuler ne fait rien, Transférer effectue le transfert et"
echo "    ferme la fiche."
echo "  - Le panneau de modération (⋮) ne doit plus proposer cette action."
echo

read -p "Appuie sur Entrée pour fermer..."
