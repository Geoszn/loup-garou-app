-- 0217 — Une seule requête pour l'accueil.
--
-- À l'ouverture de l'accueil (/dashboard), l'appli lançait une quinzaine de
-- requêtes séparées (amis, quêtes, partie en cours, état de l'appli,
-- événements, bannières, saison, parties en direct...), chacune avec son aller-
-- retour réseau, son contrôle d'identité et sa connexion à la base. Depuis
-- l'Afrique vers la base en Irlande, c'est le premier écran vu par tout le monde
-- et son temps d'affichage dépend du nombre de requêtes autant que de leur coût.
--
-- get_home_bootstrap appelle ces mêmes fonctions, inchangées, et renvoie leurs
-- résultats ensemble. Chaque section est isolée : si l'une échoue, son nom est
-- listé dans `errors` (le client la redemande alors séparément) au lieu de faire
-- tomber tout l'accueil. Aucune règle d'accès ne change : chaque fonction reste
-- celle qui décide de ce que le joueur a le droit de voir.
set search_path = public;

create or replace function public.get_home_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_errors text[] := array[]::text[];
  v_social jsonb;
  v_quests jsonb;
  v_active_game jsonb;
  v_app_status jsonb;
  v_events jsonb;
  v_banners jsonb;
  v_season jsonb;
  v_live_games jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  begin v_social := public.get_my_social();
  exception when others then v_errors := v_errors || 'social'; end;

  begin v_quests := public.get_my_quests();
  exception when others then v_errors := v_errors || 'quests'; end;

  begin v_active_game := public.get_my_active_game();
  exception when others then v_errors := v_errors || 'active_game'; end;

  begin v_app_status := public.get_app_status();
  exception when others then v_errors := v_errors || 'app_status'; end;

  begin v_events := public.get_active_events();
  exception when others then v_errors := v_errors || 'events'; end;

  begin v_banners := public.get_active_banners();
  exception when others then v_errors := v_errors || 'banners'; end;

  begin v_season := public.get_my_season();
  exception when others then v_errors := v_errors || 'season'; end;

  begin v_live_games := public.get_live_games();
  exception when others then v_errors := v_errors || 'live_games'; end;

  return jsonb_build_object(
    'social', v_social,
    'quests', v_quests,
    'active_game', v_active_game,
    'app_status', v_app_status,
    'events', v_events,
    'banners', v_banners,
    'season', v_season,
    'live_games', v_live_games,
    'errors', to_jsonb(v_errors)
  );
end;
$$;

revoke execute on function public.get_home_bootstrap() from public, anon;
grant execute on function public.get_home_bootstrap() to authenticated;
