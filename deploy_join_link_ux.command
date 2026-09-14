#!/bin/bash
# Double-clique sur ce fichier pour déployer la correction du parcours
# "rejoindre par lien" (capture WhatsApp reçue d'un joueur) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu (deux bugs UX distincts sur le même écran /rejoindre/:code) :
#
#  1. Demande déjà en attente → cul-de-sac. Recliquer le même lien
#     d'invitation pendant que sa demande précédente attendait encore la
#     réponse de l'hôte affichait une carte d'erreur sèche ("Votre demande
#     est déjà en attente de réponse.") sans aucun bouton pour avancer.
#     join_game (migration 0154) traite maintenant ce cas exactement comme
#     la création d'une nouvelle demande : le joueur est renvoyé vers l'écran
#     d'attente habituel (/attente/:gameId), qui propose déjà "Suivre la
#     partie" (si elle est en cours) et "Annuler ma demande".
#
#  2. Pas de compte → redirection muette vers la connexion. Un nouvel
#     arrivant depuis un lien d'invitation (WhatsApp...) sans session
#     atterrissait sans aucune explication sur le formulaire de connexion.
#     JoinByLink.tsx affiche désormais un écran explicite avec deux boutons
#     ("Créer un compte pour rejoindre" / "J'ai déjà un compte"), et le code
#     de la partie visée (`redirect=/rejoindre/:code`) traverse maintenant
#     toute la chaîne inscription → confirmation d'email → connexion, pour
#     ramener automatiquement le joueur sur SA partie une fois prêt — plutôt
#     que de le laisser sur le tableau de bord général sans le code.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Parcours \"rejoindre par lien\" : deux culs-de-sac corrigés"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0154_join_game_idempotent_pending.sql
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
    msg="Corrige le parcours de connexion via un lien d'invitation (demande déjà en attente + création de compte)"
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
echo "  - Cliquer un lien d'invitation (/rejoindre/CODE) sans être connecté :"
echo "    doit afficher 'Rejoindre la partie' avec deux boutons, pas une"
echo "    redirection muette vers la connexion."
echo "  - Depuis ce bouton 'Créer un compte pour rejoindre', créer un compte"
echo "    puis confirmer l'email (dans le même onglet ET dans un onglet"
echo "    différent) : doit ramener directement sur /rejoindre/CODE, pas sur"
echo "    le tableau de bord général."
echo "  - Rejoindre une partie déjà en cours (demande mise en attente), puis"
echo "    recliquer le MÊME lien d'invitation une seconde fois : doit"
echo "    renvoyer vers l'écran d'attente habituel, plus jamais l'erreur"
echo "    'Votre demande est déjà en attente de réponse.'"
echo

read -p "Appuie sur Entrée pour fermer..."
