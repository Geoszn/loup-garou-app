#!/bin/bash
# Double-clique sur ce fichier pour déployer le mode automatique de
# composition des rôles (migration 0143) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Nouveau bouton "Mode automatique" dans l'onglet Rôles du tiroir de réglages
# du salon d'attente : une fois activé, le système choisit la composition des
# rôles selon le nombre de joueurs présents au moment de lancer la partie
# (recalculée à cet instant, pas figée au moment où le bouton est coché),
# via la fonction compute_default_role_counts déjà utilisée par le jeu.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Mode automatique de composition des rôles — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0143_auto_role_counts.sql
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
    msg="Ajoute un mode automatique de composition des rôles, équilibré selon le nombre de joueurs"
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
echo "  - Salon d'attente → Réglages → onglet Rôles : le bouton 🤖 Mode"
echo "    automatique est bien visible en haut, désactivé par défaut."
echo "  - Une fois activé : les cases de rôles disparaissent, remplacées par"
echo "    un aperçu (Loups-Garous, rôles spéciaux inclus, villageois restants)."
echo "  - Faire rejoindre/quitter un joueur pendant que le mode auto est actif :"
echo "    l'aperçu doit se recalculer tout seul (nombre de joueurs à jour)."
echo "  - Lancer la partie en mode auto avec 5, 10 et 20 joueurs (par ex. via"
echo "    les bots de test admin) : vérifier que la composition réellement"
echo "    distribuée correspond bien à celle annoncée dans l'aperçu juste avant."
echo "  - Décocher le mode auto puis cocher un rôle à la main : les réglages"
echo "    manuels doivent fonctionner exactement comme avant."
echo
read -p "Appuie sur Entrée pour fermer..."
