-- ============================================================================
-- Autorisations d'exécution des fonctions pour les utilisateurs connectés
-- ============================================================================
grant execute on function public.create_game(text, jsonb) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.update_game_settings(uuid, jsonb) to authenticated;
grant execute on function public.submit_cupidon(uuid, uuid, uuid) to authenticated;
grant execute on function public.submit_voyante(uuid, uuid) to authenticated;
grant execute on function public.submit_wolf_vote(uuid, uuid) to authenticated;
grant execute on function public.submit_sorciere(uuid, boolean, uuid) to authenticated;
grant execute on function public.submit_petite_fille(uuid, boolean) to authenticated;
grant execute on function public.submit_vote(uuid, uuid) to authenticated;
grant execute on function public.submit_hunter_shot(uuid, uuid) to authenticated;
grant execute on function public.tick_game(uuid) to authenticated;
grant execute on function public.get_my_game_view(uuid) to authenticated;

-- Fonctions internes, exécutées uniquement par d'autres fonctions security
-- definer, mais on autorise leur exécution directe sans risque (elles ne
-- modifient rien de sensible / appliquent déjà leurs propres vérifications).
grant execute on function public.my_role_in_game(uuid) to authenticated;
