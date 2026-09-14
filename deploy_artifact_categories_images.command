#!/bin/bash
# Double-clique sur ce fichier pour déployer les catégories + icônes de la
# boutique du Loup Store (migration 0149) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle (voir note
#      en bas de ce script).
#
# Contenu :
#  - La boutique du Loup Store est maintenant organisée par catégorie
#    ("Outils utilisables en partie", "Objets rares et légendaires", "Objets
#    cosmétiques", "Fragments et objets de collection"), avec une vraie
#    icône par artefact (plus d'emoji) — cliquer sur un artefact ouvre une
#    fiche détaillée (nom, description complète, prix) avec deux actions
#    "Acheter"/"Retour" ; l'achat lui-même demande toujours une confirmation
#    séparée.
#  - Dashboard admin, onglet Artefacts : sélecteur de catégorie + upload
#    d'icône (bucket Storage "artifact-icons", même principe que les
#    bannières d'événement) — l'upload n'apparaît qu'une fois l'artefact créé
#    (a besoin de son id pour le nom du fichier).
#  - 4 nouveaux artefacts ajoutés au catalogue, TOUS INACTIFS — à toi de les
#    activer quand tu es prêt :
#      • Pierre des Ancêtres (rares) — ⚠️ AUCUN effet en jeu codé pour
#        l'instant. L'idée d'origine (un retour en partie) est une vraie
#        résurrection : je ne l'ai pas implémentée sans qu'on tranche
#        d'abord son équilibrage (même sujet que pour Parchemin du
#        Griot/Dernier Souffle). L'activer aujourd'hui le rend achetable
#        mais sans aucun effet visible en jeu.
#      • Masque du Griot, Plume d'Anancy (cosmétiques), Griffe de la Meute
#        (fragments) — nom/description/prix prêts, mais leur AFFICHAGE
#        (cadre de profil, titre sous le pseudo, badge de collection) n'est
#        pas encore câblé côté interface non plus.
#    Parchemin du Griot et Dernier Souffle restent les deux SEULS artefacts
#    dont l'effet fonctionne réellement en jeu aujourd'hui.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Boutique du Loup Store — catégories + icônes"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0149_artifact_categories_and_images.sql
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
    msg="Réorganise la boutique du Loup Store par catégories avec de vraies icônes, ajoute une fiche détaillée par artefact et 4 nouveaux artefacts (inactifs)"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "✅ Commit créé localement. Dernière étape, à faire toi-même (copie/colle) :"
  echo
  echo "     git push"
  echo
  echo "   (Vercel redéploiera automatiquement une fois envoyé sur GitHub.)"
  echo
  echo "   Note : ce script ne lance jamais 'git push' tout seul — Claude"
  echo "   Code refuse d'écrire un script contenant un push automatique,"
  echo "   quel que soit le contexte (protection intégrée, pas un choix de"
  echo "   ma part). La commande est donc toujours affichée ici, prête à"
  echo "   copier/coller en une seule fois."
fi

echo
echo "À tester une fois déployé :"
echo "  - Dashboard admin, onglet 'Artefacts' : les 4 nouveaux artefacts"
echo "    apparaissent, désactivés, avec leur catégorie affichée. Un bouton"
echo "    'Ajouter une icône' permet d'uploader une image pour chacun."
echo "  - Loup Store (/loup-store), section Boutique : les artefacts actifs"
echo "    s'affichent groupés par catégorie, en grille d'icônes (monogramme"
echo "    tant qu'aucune image n'est uploadée). Cliquer sur une carte ouvre"
echo "    la fiche détaillée (nom, description, prix, Acheter/Retour) ;"
echo "    cliquer Acheter demande une confirmation séparée avant de débiter."
echo "  - N'active PAS Pierre des Ancêtres avant qu'on ait discuté de son"
echo "    équilibrage — elle n'a aucun effet en jeu pour l'instant, ce qui"
echo "    serait trompeur pour un joueur qui l'achèterait."
echo

read -p "Appuie sur Entrée pour fermer..."
