-- Bug : "duplicate key value violates unique constraint game_players_game_id_user_id_key"
-- quand l'hôte clique "Accepter" sur une demande de rejoindre.
--
-- Cause racine : un joueur clique le lien pendant que la partie est EN COURS
-- (join_game crée alors une game_join_requests en attente, cf. la branche du
-- bas). Plus tard, l'hôte relance la partie (restart_game -> statut 'lobby').
-- Le joueur retente (ou avait un onglet resté ouvert) : comme le statut est
-- désormais 'lobby', join_game emprunte cette fois la branche directe
-- (status in ('lobby','ended')) et l'ajoute tout de suite à game_players —
-- sans jamais nettoyer l'ancienne demande restée "pending". Résultat : le
-- joueur est déjà membre ET a toujours une demande en attente affichée à
-- l'hôte. Cliquer "Accepter" rappelle _add_player_to_game, qui tente un
-- second insert -> violation de contrainte unique.
--
-- Correctif à deux niveaux :
--  1. _add_player_to_game devient idempotente (no-op si déjà membre) —
--     protège tous les appelants, présents et futurs.
--  2. join_game nettoie désormais toute demande "pending" résiduelle dès
--     qu'un joueur est (re)devenu membre, dans les deux branches, pour que
--     ça ne se reproduise plus.
--  3. respond_join_request gère explicitement le cas "déjà membre" : la
--     demande est simplement marquée acceptée, sans nouvel insert ni entrée
--     de journal superflue.

create or replace function public._add_player_to_game(p_game_id uuid, p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_seat int;
  v_icon text;
begin
  -- Idempotent : si ce joueur est déjà dans la partie (reconnexion, course
  -- entre plusieurs chemins d'entrée...), on ne fait rien plutôt que de
  -- planter sur la contrainte unique (game_id, user_id).
  if exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_user_id) then
    return;
  end if;

  select count(*) into v_count from public.game_players where game_id = p_game_id;
  if v_count >= 25 then
    raise exception 'Cette partie est complète (25 joueurs maximum).';
  end if;

  v_seat := v_count + 1;
  select avatar_icon into v_icon from public.profiles where id = p_user_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (p_game_id, p_user_id, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), v_seat, false, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (p_game_id, coalesce(nullif(trim(p_display_name), ''), 'Un joueur') || ' a rejoint la partie.');
end;
$$;

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
    -- Nettoyage d'une éventuelle demande restée "pending" d'avant (ex :
    -- demandée pendant que la partie était en cours, puis la partie a été
    -- relancée / le joueur a été ajouté entretemps par un autre chemin) —
    -- sinon elle ressurgit indéfiniment côté hôte et fait planter
    -- respond_join_request sur la contrainte unique.
    update public.game_join_requests
    set status = 'accepted', responded_at = now()
    where game_id = v_game.id and user_id = v_user and status = 'pending';
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
    update public.game_join_requests
    set status = 'accepted', responded_at = now()
    where game_id = v_game.id and user_id = v_user and status = 'pending';
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

create or replace function public.respond_join_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_request public.game_join_requests%rowtype;
  v_game public.games%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_request from public.game_join_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'Cette demande n’est plus en attente.';
  end if;

  select * into v_game from public.games where id = v_request.game_id;
  if not found or v_game.host_id <> v_user then
    raise exception 'Seul l’hôte peut répondre à cette demande.';
  end if;

  if p_accept then
    if v_game.status <> 'lobby' then
      raise exception 'La partie a déjà commencé.';
    end if;
    -- _add_player_to_game est désormais idempotente : si ce joueur est déjà
    -- membre (demande devenue obsolète entretemps), elle ne fait rien et on
    -- se contente de marquer la demande comme acceptée.
    perform public._add_player_to_game(v_game.id, v_request.user_id, v_request.display_name);
    update public.game_join_requests set status = 'accepted', responded_at = now() where id = p_request_id;
  else
    update public.game_join_requests set status = 'rejected', responded_at = now() where id = p_request_id;
  end if;
end;
$$;

grant execute on function public._add_player_to_game(uuid, uuid, text) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.respond_join_request(uuid, boolean) to authenticated;
