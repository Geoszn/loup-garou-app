#!/bin/bash
# Double-clique sur ce fichier pour déployer la correction "les bots
# n'accélèrent pas le débat" (migration 0144) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# admin_auto_play_bots (mode de test solo, réservé admin) traversait déjà
# automatiquement toutes les phases n'attendant que des bots, SAUF le débat
# (day_discussion, 300s par défaut — la plus longue de la partie) : les bots
# ne se déclaraient jamais "d'accord pour voter". Corrigé : ils le font
# maintenant automatiquement dès que ce mode est actif.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Bots — accélérer le débat — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0144_bot_skip_discussion.sql
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
    msg="Fait aussi avancer automatiquement le débat en mode de test solo (bots d'accord pour voter)"
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
echo "  - Partie de test avec au moins 2 bots, Capitaine désactivé : pendant"
echo "    le débat, clique 'Faire jouer les bots' (maintenant visible à cette"
echo "    phase) — les bots se déclarent d'accord ; une fois la majorité"
echo "    atteinte, TON bouton 'Lancer le vote' doit s'activer (à toi de"
echo "    cliquer, ce n'est pas fait à ta place)."
echo "  - Même test avec Capitaine activé ET élu sur un bot : cette fois le"
echo "    vote doit se lancer tout seul dès la majorité atteinte, sans clic."
echo "  - Vérifie qu'une vraie partie (sans bot) n'est pas affectée : le"
echo "    bouton reste invisible pour un hôte non-admin ou sans bot dans la"
echo "    partie."
echo
read -p "Appuie sur Entrée pour fermer..."
