-- ============================================================================
-- Suite de 0184 (audit de sécurité). Vérifié sur la base réelle après 0184 :
-- six fonctions restaient exécutables par un visiteur NON connecté
-- (is_admin_user, submit_feedback, submit_host_call_vote, get_invite_preview
-- — voulue —, avatar_icon_min_points, rank_tier_for_points). Leur droit ne
-- venait pas du rôle anon mais du pseudo-rôle PUBLIC ("tout le monde"), que
-- 0184 ne retirait pas : `revoke ... from anon` n'enlève rien à ce qu'anon
-- hérite de PUBLIC. Cas le plus gênant : is_admin_user(uuid), qui permettait
-- à n'importe qui de tester si un identifiant précis est administrateur.
--
-- Corrigé en deux temps, dans cet ordre (l'ordre compte) :
--   1. Grave explicitement le droit d'exécution des rôles authenticated et
--      service_role sur toutes les fonctions qu'ils peuvent exécuter
--      AUJOURD'HUI, quelle qu'en soit l'origine — pour que retirer PUBLIC
--      ensuite ne leur enlève rien de ce dont ils dépendent (dont
--      is_admin_user, évaluée par les policies de stockage avec le rôle du
--      joueur, et submit_feedback/submit_host_call_vote, appelées avec son
--      jeton).
--   2. Retire PUBLIC de toutes les fonctions du schéma. anon ne garde alors
--      que ses grants explicites (les 6 lectures publiques posées en 0184).
--   3. Les futures fonctions ne reçoivent plus PUBLIC par défaut (déjà posé
--      en 0045 mais visiblement inopérant pour les fonctions créées depuis).
-- ============================================================================
set search_path = public;

do $$
declare
  r record;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    if has_function_privilege('service_role', r.oid, 'EXECUTE') then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end
$$;

revoke execute on all functions in schema public from public;

alter default privileges in schema public revoke execute on functions from public;
