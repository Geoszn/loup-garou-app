#!/bin/bash
# Double-clique sur ce fichier pour déployer le correctif de la course
# (race condition) découverte juste après le déploiement précédent
# (capture WhatsApp : "duplicate key value violates unique constraint
# game_join_requests_game_id_user_id_key" au lieu de l'écran d'attente) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - join_game (déjà corrigée par la migration précédente pour ne plus
#    bloquer sur une demande déjà en attente) et sa jumelle
#    request_join_public_game (même bug, jamais corrigé jusqu'ici) lisaient
#    d'abord la demande existante puis décidaient d'insérer ou de mettre à
#    jour. Si deux appels arrivaient presque en même temps pour le même
#    joueur/partie (double appel réseau, deux onglets, l'effet React qui se
#    redéclenche avant la fin du premier appel...), les deux pouvaient lire
#    "aucune ligne" avant qu'aucun des deux n'ait inséré — le second
#    plantait alors sur la contrainte unique.
#  - Remplacé dans les deux fonctions par un unique "insert ... on conflict
#    ... do update" atomique : Postgres garantit qu'un seul des deux appels
#    concurrents insère, l'autre met à jour, plus jamais de violation
#    possible. Comportement inchangé pour un appel isolé (le cas normal).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Course (race condition) sur les demandes pour rejoindre une partie"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0155_join_request_race_condition.sql
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
    msg="Corrige une course (race condition) sur les demandes pour rejoindre une partie"
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
echo "  - Redemander à ton contact de rejoindre via le même lien d'invitation :"
echo "    doit maintenant arriver sur l'écran d'attente, plus jamais l'erreur"
echo "    'duplicate key value violates unique constraint...'."
echo "  - Rejoindre une partie publique depuis la liste du tableau de bord :"
echo "    doit toujours fonctionner normalement (comportement inchangé pour"
echo "    un appel isolé, ce correctif ne change que le cas de deux appels"
echo "    quasi simultanés)."
echo

read -p "Appuie sur Entrée pour fermer..."
