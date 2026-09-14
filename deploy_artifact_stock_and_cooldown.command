#!/bin/bash
# Double-clique sur ce fichier pour déployer le stock/cooldown des artefacts
# rares + le menu "Mes Artefacts" (migration 0153) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - Tout artefact catégorisé "Objets rares et légendaires" (ex. Pierre des
#    Ancêtres) devient RECHARGEABLE au lieu d'un achat unique pour toujours :
#    stock max par joueur + délai de rachat en jours, tous deux réglables
#    depuis le formulaire d'artefact (apparaît automatiquement dès que la
#    catégorie "rares" est sélectionnée — valeurs par défaut 1 unité / 10
#    jours). Pierre des Ancêtres consomme désormais réellement une charge de
#    stock à chaque résurrection (en plus de la limite d'une fois par
#    partie déjà en place).
#  - Loup Store : nouvel onglet "Mes Artefacts" (à côté de Boutique et
#    Historique) — tout ce que le joueur possède, avec le stock restant et
#    la prochaine date de rachat pour les artefacts rechargeables.
#  - Corrige au passage un oubli de la migration 0152 : admin_upsert_store_artifact
#    n'acceptait encore que les 5 premiers effets dans sa propre validation
#    (la contrainte de la base, elle, avait bien été mise à jour) — un admin
#    choisissant Boussole du Village, Masque du Sans-Visage, Balance de
#    l'Ange, Pierre des Ancêtres ou Feu Sacré des Ancêtres se serait vu
#    opposer "Effet invalide." à tort.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Stock + cooldown des artefacts rares"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0153_artifact_stock_and_cooldown.sql
echo "Le contenu de la migration a été copié dans le presse-papiers."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Dans l'éditeur SQL qui vient de s'ouvrir : colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois la migration exécutée avec succès..."

echo
echo "→ Étape 2/3 : vérification du code"
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
echo "→ Étape 3/3 : préparation du commit"
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
    msg="Ajoute un stock limité + cooldown de rachat pour les artefacts rares, et le menu Mes Artefacts dans le Loup Store"
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
echo "  - Dashboard admin, onglet Artefacts : choisir la catégorie 'Objets"
echo "    rares et légendaires' fait apparaître les champs 'Stock max par"
echo "    joueur' et 'Rachat tous les (jours)' — Pierre des Ancêtres doit"
echo "    déjà avoir 1 / 10 par défaut si elle existait avant cette migration."
echo "  - Loup Store, Boutique : Pierre des Ancêtres achetée une fois affiche"
echo "    un badge de stock (1) sur sa carte au lieu d'un 'Possédé' plein —"
echo "    la fiche détaillée doit permettre de la racheter SEULEMENT si le"
echo "    stock n'est pas au maximum et si le délai de 10 jours est passé."
echo "  - Loup Store, nouvel onglet 'Mes Artefacts' : liste tout ce qui est"
echo "    possédé, avec le stock et la prochaine date de rachat pour Pierre"
echo "    des Ancêtres."
echo "  - En partie : un joueur avec Pierre des Ancêtres en stock qui meurt"
echo "    doit voir son stock diminuer de 1 (visible dans 'Mes Artefacts')"
echo "    en plus de revenir en jeu comme avant."
echo

read -p "Appuie sur Entrée pour fermer..."
