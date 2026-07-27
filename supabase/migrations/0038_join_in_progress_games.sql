-- ============================================================================
-- Rejoindre une partie déjà en cours (publique OU privée) : au lieu de
-- refuser purement et simplement, on crée une demande en attente (même
-- mécanisme que les parties publiques déjà en salon) qui reste "pending"
-- tant que la partie tourne. L'hôte ne la voit et ne peut y répondre qu'une
-- fois revenu au statut 'lobby' (fin de partie + redémarrage, voir
-- restart_game) — c'est déjà le comportement de respond_join_request/
-- get_my_game_view, qui n'exposent les demandes que pour un salon en
-- 'lobby' ; on l'étend ici aux parties privées (avant : réservé au public).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- join_game : rejoint directement si la partie est en salon (ou terminée,
-- comportement inchangé) ; sinon (partie en cours), enregistre une demande
-- en attente au lieu de refuser. Renvoie désormais un champ 'status' :
-- 'joined' (rejoint tout de suite) ou 'pending' (demande envoyée) — les
-- appelants (Dashboard.tsx, JoinByLink.tsx) doivent regarder ce champ pour
-- savoir où naviguer.
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
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    return jsonb_build_object('status', 'joined', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  if v_game.status in ('lobby', 'ended') then
    perform public._add_player_to_game(v_game.id, v_user, p_display_name);
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    return jsonb_build_object('status', 'joined', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  -- La partie est déjà en cours : on ne peut plus rejoindre immédiatement,
  -- mais on peut envoyer une demande qui attendra son retour en salon.
  select count(*) into v_existing from public.game_players where game_id = v_game.id;
  if v_existing >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
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

-- ----------------------------------------------------------------------------
-- list_public_games : parties publiques auxquelles je ne participe pas
-- déjà — désormais salon (lobby) ET parties déjà en cours (avant : salon
-- uniquement). Ajoute le statut, pour que l'interface puisse distinguer
-- "rejoignable tout de suite après validation" et "en cours, la demande
-- attendra la fin de la partie".
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
      g.status,
      g.created_at,
      hp.display_name as host_name,
      hp.avatar_icon as host_avatar_icon,
      (select count(*) from public.game_players gp2 where gp2.game_id = g.id) as player_count
    from public.games g
    join public.game_players hp on hp.game_id = g.id and hp.user_id = g.host_id
    where g.is_public and g.status <> 'ended'
      and not exists (
        select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = auth.uid()
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'game_id', c.game_id,
    'code', c.code,
    'status', c.status,
    'host_name', c.host_name,
    'host_avatar_icon', c.host_avatar_icon,
    'player_count', c.player_count,
    'created_at', c.created_at,
    'already_requested', exists (
      select 1 from public.game_join_requests r
      where r.game_id = c.game_id and r.user_id = auth.uid() and r.status = 'pending'
    )
  ) order by (c.status = 'lobby') desc, c.created_at desc), '[]'::jsonb)
  from candidates c
  where c.status <> 'lobby' or c.player_count < 20;
$$;

grant execute on function public.list_public_games() to authenticated;

-- ----------------------------------------------------------------------------
-- request_join_public_game : accepte désormais aussi les parties déjà en
-- cours (avant : salon uniquement) — la demande reste en attente jusqu'à ce
-- que l'hôte y réponde, une fois la partie revenue en salon.
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
  if not found or not v_game.is_public or v_game.status = 'ended' then
    raise exception 'Cette partie n’accepte plus de nouvelles demandes.';
  end if;

  if exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous participez déjà à cette partie.';
  end if;

  select count(*) into v_count from public.game_players where game_id = p_game_id;
  if v_game.status = 'lobby' and v_count >= 20 then
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
-- get_my_join_request_status : ne marque plus une demande "expired" quand
-- la partie est en cours — c'est désormais un cas normal et attendu (elle
-- reste "pending" jusqu'au retour en salon), plus une anomalie. Ajoute
-- game_status pour que l'écran d'attente (PendingApproval.tsx) puisse
-- adapter son message ("la partie est en cours, patientez").
-- ----------------------------------------------------------------------------
create or replace function public.get_my_join_request_status(p_game_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'status', r.status,
    'code', g.code,
    'game_status', g.status
  )
  from public.game_join_requests r
  join public.games g on g.id = r.game_id
  where r.game_id = p_game_id and r.user_id = auth.uid()
  order by r.created_at desc
  limit 1;
$$;

grant execute on function public.get_my_join_request_status(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_game_view : reprise intégrale de 0033_public_games.sql, avec une
-- seule différence — le champ join_requests n'est plus réservé aux parties
-- publiques (v_game.is_public retiré de la condition) : une partie privée
-- rejointe par code pendant qu'elle est en cours crée maintenant, elle
-- aussi, des demandes que l'hôte doit voir et valider à son retour en salon.
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
      when v_game.host_id = v_user and v_game.status = 'lobby' then coalesce((
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
