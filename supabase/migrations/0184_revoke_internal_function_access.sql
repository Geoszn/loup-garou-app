-- ============================================================================
-- CORRECTIF DE SÉCURITÉ (audit) : des fonctions INTERNES du moteur de jeu
-- étaient appelables directement par n'importe quel visiteur — y compris
-- NON connecté (rôle anon) pour la plupart. Constaté sur la base réelle :
--   - apply_rank_result / apply_rank_updates_for_game : attribuer ou
--     retirer des points de rang à n'importe quel joueur (p_impact_bonus
--     libre, aucun contrôle d'identité), sans même être connecté.
--   - compute_griot_phrase, compute_impact_bonus, game_view_*_fields
--     (witch, wolf_pack, seer_griot, chasseuse, vote...) : lecture
--     d'informations SECRÈTES d'une partie (composition de la meute, cible
--     de la Chasseuse, potions...) avec un rôle passé en paramètre.
--   - advance_phase(p_forced), resolve_day_vote_deaths, next_night_step,
--     _add_player_to_game (joueur connecté) : forcer les phases, résoudre un
--     vote à tout moment, injecter un joueur.
--   - infect_player, apply_anancy_swap, check_and_apply_*_win,
--     ensure_daily_quests, sync_daily_quests_for_all_players... : mutations
--     du jeu et des quêtes.
-- Cause : la migration 0045 avait retiré ces droits pour les fonctions
-- EXISTANTES à l'époque, mais Supabase accorde automatiquement EXECUTE à
-- anon et authenticated sur chaque NOUVELLE fonction (privilèges par défaut
-- du schéma), et 0045 ne neutralisait que le rôle PUBLIC, pas ces deux-là.
-- Toutes les fonctions créées depuis (0046 et suivantes) sont donc restées
-- ouvertes sans que personne ne l'ait demandé.
--
-- Corrigé en trois temps :
--   1. anon : plus AUCUNE fonction, sauf les 6 lectures publiques prévues
--      (page d'accueil, aperçu d'invitation, textes du jeu).
--   2. authenticated : retrait des fonctions internes listées ci-dessous
--      (jamais appelées par le site — vérifié dans src/ et api/). Ces
--      fonctions continuent de s'exécuter normalement quand elles sont
--      appelées PAR d'autres fonctions SECURITY DEFINER (elles tournent avec
--      les droits du propriétaire). Restent ouvertes aux joueurs : les
--      fonctions réellement utilisées par le client, les aides de RLS
--      (can_*_channel, is_game_participant, my_role_in_game,
--      is_alive_petite_fille, is_admin_user — évaluées avec le rôle du
--      joueur par les policies) et les trois submit_* qui contrôlent
--      eux-mêmes l'identité.
--   3. Privilèges par défaut : une nouvelle fonction n'est plus appelable
--      par anon/authenticated tant qu'un `grant execute` explicite ne la
--      rend pas publique — le garde-fou que 0045 voulait déjà poser.
-- ============================================================================
set search_path = public;

-- 1. anon : rien, sauf les lectures publiques.
revoke execute on all functions in schema public from anon;

grant execute on function public.get_active_events() to anon;
grant execute on function public.get_app_status() to anon;
grant execute on function public.get_content_overrides() to anon;
grant execute on function public.get_disabled_roles() to anon;
grant execute on function public.get_invite_preview(text) to anon;
grant execute on function public.get_public_leaderboard(text, text, int) to anon;

-- 2. authenticated : retrait des fonctions internes (toutes surcharges).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        '_add_player_to_game', '_remove_player', '_is_village_muted',
        'advance_phase', 'begin_night', 'kill_player', 'infect_player',
        'apply_anancy_swap', 'apply_rank_result', 'apply_rank_updates_for_game',
        'check_and_apply_win', 'check_and_apply_anancy_win', 'check_and_apply_ange_win',
        'check_and_apply_chasseuse_win', 'check_and_apply_juge_win',
        'clear_revival_pending_if_ended',
        'resolve_night_deaths', 'resolve_day_vote_deaths', 'resolve_captain_election',
        'next_night_step', 'step_duration_seconds', 'get_wolf_target', 'role_alive_exists',
        'compute_griot_phrase', 'compute_impact_bonus',
        'ensure_daily_quests', 'sync_daily_quests_for_all_players', 'touch_game_activity',
        'game_view_anancy_fields', 'game_view_artifacts_fields', 'game_view_chasseuse_fields',
        'game_view_juge_fields', 'game_view_lobby_fields', 'game_view_progression_fields',
        'game_view_seer_griot_fields', 'game_view_thief_fields', 'game_view_vote_fields',
        'game_view_wild_child_fields', 'game_view_witch_fields', 'game_view_wolf_pack_fields'
      ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end
$$;

-- 3. Les futures fonctions ne sont plus ouvertes par défaut.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
