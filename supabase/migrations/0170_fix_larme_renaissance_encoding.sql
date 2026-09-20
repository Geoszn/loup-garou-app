-- ============================================================================
-- Corrige l'encodage du nom/de la description de la Larme de Renaissance
-- (migration 0169) : le texte affiché en boutique montre des caractères
-- corrompus ("√©limination" au lieu de "élimination", "r√¥le" au lieu de
-- "rôle"...) — c'est le même bug de corruption au COLLAGE dans Supabase déjà
-- rencontré avec le journal de partie (accents UTF-8 mal réinterprétés,
-- probablement par Safari/macOS, PAS par le pipeline presse-papiers utilisé
-- ici, vérifié à chaque fois octet par octet avant de livrer le script).
-- Donc : coller CETTE migration via Chrome plutôt que Safari, sans quoi le
-- même problème se reproduira sur ce simple UPDATE.
-- ============================================================================
set search_path = public;

update public.store_artifacts
set
  name_fr = 'Larme de Renaissance',
  name_en = 'Tear of Rebirth',
  description_fr = 'Permet un retour en jeu au jour qui suit ton élimination — mais tu reviens en simple Villageois(e), ayant tout oublié de ton rôle d''origine. Une fois par partie.',
  description_en = 'Allows you to come back to life on the day after your elimination — but you return as a plain Villager, having forgotten your original role entirely. Once per game.'
where key = 'larme_renaissance';
