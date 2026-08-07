-- ============================================================================
-- BUG : impossible de rejoindre une partie déjà en cours via un lien
-- d'invitation — message brut "invalid input syntax for type uuid: '7'"
-- au lieu de la mise en attente prévue (voir 0038_join_in_progress_games.sql
-- : la demande doit rester "pending" jusqu'au retour en salon).
--
-- Cause : dans join_game (dernière version dans
-- 0054_increase_max_players_to_25.sql), la variable v_existing — déclarée
-- `uuid` et utilisée plus haut pour vérifier si le joueur est déjà dans la
-- partie — était réutilisée plus bas pour stocker le NOMBRE de joueurs
-- (select count(*) into v_existing ...). Affecter un entier (ex : 7 joueurs
-- déjà présents) à une variable uuid fait échouer la fonction avec cette
-- erreur dès que la partie a au moins un joueur — donc systématiquement
-- pour toute partie déjà en cours.
--
-- Correctif : nouvelle variable dédiée v_player_count (int) pour ce compte,
-- le reste de la fonction est identique à 0054.
-- ============================================================================
set search_path = public;

create or replace function public.join_game(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing uuid;
  v_player_count int;
  v_existing_request public.game_join_requests%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_game from public.games where code = upper(trim(p_code));
  if not found then
    raise exception 'Aucune partie ne correspond à ce code.';
  end if;

  select id into v_existing from public.game_players where game_id = v_game.id and user_id = v_user;
  if v_existing is not null then
    -- Reconnexion à une partie où l'on est déjà engagé : toujours autorisée,
    -- même interrupteur coupé ou compte suspendu depuis (on ne coupe pas
    -- une partie en cours sous le pied de quelqu'un).
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    return jsonb_build_object('status', 'joined', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  if exists (select 1 from public.profiles where id = v_user and is_banned) then
    raise exception 'Votre compte a été suspendu.';
  end if;

  if not (select new_games_enabled from public.app_settings where id = 1) then
    raise exception 'Impossible de rejoindre une nouvelle partie pour le moment.';
  end if;

  if v_game.status in ('lobby', 'ended') then
    perform public._add_player_to_game(v_game.id, v_user, p_display_name);
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    return jsonb_build_object('status', 'joined', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  select count(*) into v_player_count from public.game_players where game_id = v_game.id;
  if v_player_count >= 25 then
    raise exception 'Cette partie est complète (25 joueurs maximum).';
  end if;

  select * into v_existing_request from public.game_join_requests where game_id = v_game.id and user_id = v_user;

  if found and v_existing_request.status = 'pending' then
    raise exception 'Votre demande est déjà en attente de réponse.';
  end if;

  if found then
    update public.game_join_requests
    set status = 'pending',
        display_name = coalesce(nullif(trim(p_display_name), ''), 'Joueur'),
        created_at = now(),
        responded_at = null
    where id = v_existing_request.id;
  else
    insert into public.game_join_requests (game_id, user_id, display_name)
    values (v_game.id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'));
  end if;

  return jsonb_build_object('status', 'pending', 'game_id', v_game.id, 'code', v_game.code);
end;
$$;
