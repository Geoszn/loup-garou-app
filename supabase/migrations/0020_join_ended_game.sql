-- ============================================================================
-- Rejoindre un salon "entre deux parties" : jusqu'ici, join_game et
-- invite_friend_to_game exigeaient status = 'lobby', donc dès qu'une partie
-- se terminait (status = 'ended'), plus personne ne pouvait rejoindre tant
-- que l'hôte n'avait pas cliqué sur "Rejouer avec ce groupe" (qui repasse le
-- statut à 'lobby'). On élargit la condition à ('lobby', 'ended') : un
-- nouveau joueur qui rejoint pendant l'écran de fin atterrit sur la page de
-- partie (l'écran de fin, via la redirection déjà existante dans Lobby.tsx),
-- et se retrouve automatiquement dans le salon dès que l'hôte relance —
-- restart_game réinitialise déjà l'état de tous les game_players sans
-- distinction.
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
  v_count int;
  v_existing uuid;
  v_seat int;
  v_icon text;
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
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
  end if;

  if v_game.status not in ('lobby', 'ended') then
    raise exception 'Cette partie a déjà commencé.';
  end if;

  select count(*) into v_count from public.game_players where game_id = v_game.id;
  if v_count >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
  end if;

  v_seat := v_count + 1;
  select avatar_icon into v_icon from public.profiles where id = v_user;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game.id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), v_seat, false, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game.id, coalesce(nullif(trim(p_display_name), ''), 'Un joueur') || ' a rejoint la partie.');

  delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;

  return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
end;
$$;

create or replace function public.invite_friend_to_game(p_game_id uuid, p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.status not in ('lobby', 'ended') then
    raise exception 'Cette partie n’accepte plus de nouveaux joueurs.';
  end if;

  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  if not exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(v_user, p_friend_id)
      and greatest(requester_id, addressee_id) = greatest(v_user, p_friend_id)
  ) then
    raise exception 'Vous devez être amis pour inviter ce joueur.';
  end if;

  if exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_friend_id) then
    raise exception 'Cet ami est déjà dans la partie.';
  end if;

  insert into public.game_invites (game_id, from_user_id, to_user_id)
  values (p_game_id, v_user, p_friend_id)
  on conflict (game_id, to_user_id) do nothing;
end;
$$;
