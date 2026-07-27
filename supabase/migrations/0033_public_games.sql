-- ----------------------------------------------------------------------------
-- 0033_public_games : parties publiques, découvrables depuis le tableau de
-- bord, avec validation des demandes par l'hôte. Une partie privée (par
-- défaut) fonctionne exactement comme avant : accessible uniquement via
-- invitation, lien ou code. Une partie publique apparaît dans une liste que
-- n'importe quel joueur connecté peut parcourir ; rejoindre passe alors par
-- une demande que seul l'hôte peut accepter ou refuser (pas d'entrée directe
-- via code pour ces parties-là — le principe même du contrôle par l'hôte).
-- ----------------------------------------------------------------------------

alter table public.games add column if not exists is_public boolean not null default false;

create table if not exists public.game_join_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (game_id, user_id)
);

alter table public.game_join_requests enable row level security;
-- Aucune policy : accès exclusivement via les fonctions security definer
-- ci-dessous (même patron que votes / night_actions).

-- ----------------------------------------------------------------------------
-- create_game : reprise de 0027_vote_recap.sql, avec un paramètre
-- p_is_public (défaut false : une partie reste privée sauf choix explicite
-- de l'hôte au moment de la création).
-- ----------------------------------------------------------------------------
create or replace function public.create_game(p_display_name text, p_settings jsonb default null, p_is_public boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_game_id uuid;
  v_settings jsonb;
  v_icon text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select avatar_icon into v_icon from public.profiles where id = v_user;

  v_code := public.generate_game_code();
  v_settings := jsonb_build_object(
    'discussion_seconds', coalesce((p_settings->>'discussion_seconds')::int, 300),
    'vote_seconds', coalesce((p_settings->>'vote_seconds')::int, 45),
    'vote_recap_seconds', coalesce((p_settings->>'vote_recap_seconds')::int, 90),
    'night_step_seconds', coalesce((p_settings->>'night_step_seconds')::int, 70),
    'wolf_chat_seconds', coalesce((p_settings->>'wolf_chat_seconds')::int, 180),
    'role_reveal_seconds', coalesce((p_settings->>'role_reveal_seconds')::int, 15),
    'role_counts', p_settings->'role_counts'
  );

  insert into public.games (code, host_id, settings, is_public)
  values (v_code, v_user, v_settings, coalesce(p_is_public, false))
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 1, true, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game_id, 'La partie a été créée. En attente des joueurs...');

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

-- ----------------------------------------------------------------------------
-- _add_player_to_game : logique d'ajout d'un joueur factorisée hors de
-- join_game (reprise telle quelle de 0020_join_ended_game.sql), pour être
-- réutilisée par respond_join_request lors de l'acceptation d'une demande
-- sur une partie publique.
-- ----------------------------------------------------------------------------
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
  select count(*) into v_count from public.game_players where game_id = p_game_id;
  if v_count >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
  end if;

  v_seat := v_count + 1;
  select avatar_icon into v_icon from public.profiles where id = p_user_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (p_game_id, p_user_id, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), v_seat, false, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (p_game_id, coalesce(nullif(trim(p_display_name), ''), 'Un joueur') || ' a rejoint la partie.');
end;
$$;

-- ----------------------------------------------------------------------------
-- join_game : reprise de 0020_join_ended_game.sql, utilise désormais
-- _add_player_to_game pour la partie insertion (comportement identique).
-- ----------------------------------------------------------------------------
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

  perform public._add_player_to_game(v_game.id, v_user, p_display_name);

  delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;

  return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
end;
$$;

-- ----------------------------------------------------------------------------
-- list_public_games : parties publiques encore en salon, pas complètes, et
-- auxquelles je ne participe pas déjà — pour le tableau de bord.
-- ----------------------------------------------------------------------------
create or replace function public.list_public_games()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with candidates as (
    select
      g.id as game_id,
      g.code,
      g.created_at,
      hp.display_name as host_name,
      hp.avatar_icon as host_avatar_icon,
      (select count(*) from public.game_players gp2 where gp2.game_id = g.id) as player_count
    from public.games g
    join public.game_players hp on hp.game_id = g.id and hp.user_id = g.host_id
    where g.is_public and g.status = 'lobby'
      and not exists (
        select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = auth.uid()
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'game_id', c.game_id,
    'code', c.code,
    'host_name', c.host_name,
    'host_avatar_icon', c.host_avatar_icon,
    'player_count', c.player_count,
    'created_at', c.created_at,
    'already_requested', exists (
      select 1 from public.game_join_requests r
      where r.game_id = c.game_id and r.user_id = auth.uid() and r.status = 'pending'
    )
  ) order by c.created_at desc), '[]'::jsonb)
  from candidates c
  where c.player_count < 20;
$$;

grant execute on function public.list_public_games() to authenticated;

-- ----------------------------------------------------------------------------
-- request_join_public_game : envoie (ou renvoie, après un refus) une demande
-- pour rejoindre une partie publique encore en salon.
-- ----------------------------------------------------------------------------
create or replace function public.request_join_public_game(p_game_id uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing public.game_join_requests%rowtype;
  v_count int;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found or not v_game.is_public or v_game.status <> 'lobby' then
    raise exception 'Cette partie n’accepte plus de nouvelles demandes.';
  end if;

  if exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous participez déjà à cette partie.';
  end if;

  select count(*) into v_count from public.game_players where game_id = p_game_id;
  if v_count >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
  end if;

  select * into v_existing from public.game_join_requests where game_id = p_game_id and user_id = v_user;

  if found and v_existing.status = 'pending' then
    raise exception 'Votre demande est déjà en attente de réponse.';
  end if;

  if found then
    update public.game_join_requests
    set status = 'pending',
        display_name = coalesce(nullif(trim(p_display_name), ''), 'Joueur'),
        created_at = now(),
        responded_at = null
    where id = v_existing.id;
  else
    insert into public.game_join_requests (game_id, user_id, display_name)
    values (p_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'));
  end if;

  return jsonb_build_object('status', 'pending');
end;
$$;

grant execute on function public.request_join_public_game(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- cancel_join_request : le demandeur retire sa propre demande en attente
-- (bouton "Annuler" sur l'écran d'attente).
-- ----------------------------------------------------------------------------
create or replace function public.cancel_join_request(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  delete from public.game_join_requests
  where game_id = p_game_id and user_id = v_user and status = 'pending';
end;
$$;

grant execute on function public.cancel_join_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- respond_join_request : l'hôte accepte (le demandeur rejoint réellement la
-- partie) ou refuse une demande en attente.
-- ----------------------------------------------------------------------------
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
    perform public._add_player_to_game(v_game.id, v_request.user_id, v_request.display_name);
    update public.game_join_requests set status = 'accepted', responded_at = now() where id = p_request_id;
  else
    update public.game_join_requests set status = 'rejected', responded_at = now() where id = p_request_id;
  end if;
end;
$$;

grant execute on function public.respond_join_request(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_join_request_status : pour l'écran d'attente du demandeur, qui ne
-- participe pas encore à la partie et ne peut donc pas utiliser
-- get_my_game_view (qui exige d'être déjà dans game_players). Renvoie aussi
-- le code de la partie (pas seulement passé par la navigation React, qui se
-- perdrait si l'écran d'attente est rechargé) pour pouvoir rediriger vers le
-- lobby dès que la demande est acceptée.
--
-- Si la partie a démarré avant que l'hôte n'ait répondu, la demande reste
-- techniquement 'pending' en base (l'hôte ne la voit plus dans son Lobby une
-- fois la partie lancée, get_my_game_view ne l'expose que pour le statut
-- 'lobby') : sans ce garde-fou, le demandeur resterait bloqué indéfiniment
-- sur l'écran d'attente. On renvoie donc 'expired' dans ce cas précis.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_join_request_status(p_game_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'status', case when r.status = 'pending' and g.status <> 'lobby' then 'expired' else r.status end,
    'code', g.code
  )
  from public.game_join_requests r
  join public.games g on g.id = r.game_id
  where r.game_id = p_game_id and r.user_id = auth.uid()
  order by r.created_at desc
  limit 1;
$$;

grant execute on function public.get_my_join_request_status(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_game_view : reprise de 0032_remove_petite_fille_spy.sql, ajoute
-- join_requests (visible uniquement de l'hôte, tant que la partie est
-- publique et encore en salon) pour afficher les demandes à traiter dans le
-- Lobby.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_game_view(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_my_role text;
  v_my_alive boolean;
  v_lover_id uuid;
  v_result jsonb;
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select * into v_game from public.games where id = p_game_id;
  select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  select is_alive into v_my_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select lover_with into v_lover_id from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  select jsonb_build_object(
    'game', to_jsonb(v_game) - 'thief_extra_roles',

    'players', coalesce((
      select jsonb_agg(to_jsonb(gp) order by gp.seat_number)
      from public.game_players gp where gp.game_id = p_game_id
    ), '[]'::jsonb),

    'my_role', v_my_role,
    'my_alive', coalesce(v_my_alive, false),
    'lover_id', v_lover_id,

    'thief_extra_roles', case when v_my_role = 'voleur' then v_game.thief_extra_roles else null end,

    'wolf_teammates', case when v_my_role = 'loup_garou' then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'loup_garou' and rs.user_id <> v_user
    ), '[]'::jsonb) else null end,

    'seer_reveals', case when v_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', rs.role,
        'night_number', na.night_number
      ) order by na.night_number)
      from public.night_actions na
      join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
      where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = v_user
    ), '[]'::jsonb) else null end,

    'witch_heal_used', case when v_my_role = 'sorciere' then (
      select heal_potion_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user
    ) else null end,

    'witch_poison_used', case when v_my_role = 'sorciere' then (
      select poison_potion_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user
    ) else null end,

    'wolf_target_visible_to_witch', case
      when v_my_role = 'sorciere' and v_game.status = 'night' and v_game.night_step = 'sorciere'
      then public.get_wolf_target(p_game_id, v_game.night_number)
      else null
    end,

    'wolf_current_votes', case when v_my_role = 'loup_garou' and v_game.status = 'night' and v_game.night_step = 'loup_garou' then coalesce((
      select jsonb_agg(jsonb_build_object('actor_id', actor_id, 'target_id', target_id))
      from public.night_actions
      where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou'
    ), '[]'::jsonb) else null end,

    'my_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = v_game.night_number and voter_id = v_user
    ),

    'my_captain_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = 0 and voter_id = v_user
    ),

    'vote_call_agreed_ids', case when v_game.status = 'day_discussion' then coalesce((
      select jsonb_agg(user_id) from public.vote_call_agreements
      where game_id = p_game_id and day_number = v_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'vote_recap', case when v_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb),
      'captain_voter_id', v_game.last_vote_captain_id
    ) else null end,

    'join_requests', case
      when v_game.is_public and v_game.host_id = v_user and v_game.status = 'lobby' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'user_id', user_id, 'display_name', display_name, 'created_at', created_at
        ) order by created_at asc)
        from public.game_join_requests
        where game_id = p_game_id and status = 'pending'
      ), '[]'::jsonb)
      else null
    end,

    'pending_action_required', case
      when v_game.hunter_pending = v_user then 'hunter'
      when v_game.captain_pending = v_user then 'captain_succession'
      when v_game.status = 'captain_election' and v_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = 0 and voter_id = v_user
        )
      then 'captain_vote'
      when v_game.status = 'night' and v_my_alive and v_my_role = v_game.night_step
        and not exists (
          select 1 from public.night_actions
          where game_id = p_game_id and night_number = v_game.night_number
            and step = v_game.night_step and actor_id = v_user
        )
      then v_game.night_step
      when v_game.status = 'day_vote' and v_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = v_game.night_number and voter_id = v_user
        )
      then 'vote'
      else null
    end,

    'final_reveal', case when v_game.status = 'ended' then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', rs.user_id, 'role', rs.role))
      from public.game_roles_secret rs where rs.game_id = p_game_id
    ), '[]'::jsonb) else null end,

    'log', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message, 'created_at', created_at) order by created_at desc)
      from (
        select id, message, created_at from public.game_log
        where game_id = p_game_id order by created_at desc limit 60
      ) recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
