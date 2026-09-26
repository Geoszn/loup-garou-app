-- ============================================================================
-- CORRECTIF DE SÉCURITÉ : un utilisateur connecté pouvait modifier
-- directement sa propre ligne de public.profiles depuis la console de son
-- navigateur (supabase.from('profiles').update({ is_admin: true })...) —
-- la policy "profiles_update_own" (migration 0002) autorisait tout UPDATE
-- sur sa propre ligne, SANS restriction de colonne et sans aucun trigger de
-- garde. is_admin_user() (qui protège les 37 fonctions admin_* et les
-- buckets de stockage admin) lit justement profiles.is_admin : n'importe
-- quel compte pouvait donc s'auto-promouvoir administrateur, mais aussi se
-- donner des Loup Coins, modifier ses points de rang ou lever sa propre
-- suspension (is_banned). Une modification directe de cette table ne passe
-- par aucune fonction, donc n'apparaît pas non plus dans admin_audit_log.
--
-- Vérifié avant correction : le client n'écrit JAMAIS directement dans une
-- table publique (aucun .update/.insert/.upsert/.delete après un
-- .from('...') dans src/) — toutes les écritures passent par des fonctions
-- SECURITY DEFINER, qui gardent leurs droits de propriétaire — et aucune
-- fonction non-definer n'écrit dans une table publique. Retirer les droits
-- d'écriture directe des rôles anon/authenticated sur TOUTES les tables
-- publiques ferme donc cette faille et toute la classe de failles
-- équivalentes (y compris sur les tables ajoutées plus tard, via les
-- privilèges par défaut), sans rien changer au fonctionnement de l'appli.
-- La lecture (SELECT, RLS inchangée) et le rôle service_role (api/*.ts)
-- ne sont pas touchés.
-- ============================================================================
set search_path = public;

drop policy if exists "profiles_update_own" on public.profiles;

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;
