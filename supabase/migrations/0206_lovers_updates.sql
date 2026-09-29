-- ============================================================================
-- Ajustements de la mécanique des Amoureux, demandés après l'audit du
-- 2026-09-29 :
--   1. Cupidon ne peut plus se choisir lui-même comme amoureux.
--   2. Dès qu'il y a des amoureux dans la partie, ils forment un 3e camp à
--      part entière (village / loups / amoureux) : s'ils meurent avant la
--      fin de la partie (chagrin ou autre cause), c'est une défaite pour
--      eux — aucun point de participation, quel que soit le camp d'origine
--      de leur rôle. Ils ne gagnent QUE si la partie se termine sur une
--      victoire 'amoureux'.
--   3. Bonus de +70 points pour une victoire des amoureux (même patron que
--      le bonus solo d'Anancy +50, ou le bonus d'équipe des loups +15).
--   4. Nouveau salon de chat "amoureux" : privé aux deux amoureux, ouvert
--      uniquement en journée (day_reveal/day_discussion/day_vote) — jamais
--      la nuit, qui reste réservée aux actions de rôle. Vidé à chaque
--      nouvelle nuit comme village/loups.
--
-- Le message public "est mort de chagrin..." (qui révèle indirectement
-- l'identité des amoureux une fois morts) est CONSERVÉ tel quel — jugé
-- acceptable une fois les amoureux morts/hors-jeu.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. submit_cupidon : Cupidon ne peut plus se désigner lui-même.
-- ----------------------------------------------------------------------------
create or replace function public.submit_cupidon(p_game_id uuid, p_lover1 uuid, p_lover2 uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'cupidon' then
    raise exception 'Ce n''est pas le moment pour Cupidon.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'cupidon' then
    raise exception 'Vous n''êtes pas Cupidon.';
  end if;
  if p_lover1 = p_lover2 then
    raise exception 'Choisissez deux joueurs différents.';
  end if;
  if p_lover1 = v_user or p_lover2 = v_user then
    raise exception 'Vous ne pouvez pas vous choisir vous-même.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_lover1 and is_alive)
    or not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_lover2 and is_alive) then
    raise exception 'Joueur invalide.';
  end if;

  update public.game_roles_secret set lover_with = null where game_id = p_game_id;

  update public.game_roles_secret set lover_with = p_lover2 where game_id = p_game_id and user_id = p_lover1;
  update public.game_roles_secret set lover_with = p_lover1 where game_id = p_game_id and user_id = p_lover2;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
  values (p_game_id, v_game.night_number, 'cupidon', v_user, p_lover1, jsonb_build_object('lover2', p_lover2))
  on conflict (game_id, night_number, step, actor_id)
  do update set target_id = excluded.target_id, extra = excluded.extra;

  insert into public.game_log (game_id, message)
  values (p_game_id, '💘 Cupidon a décoché ses flèches...');

  perform public.advance_phase(p_game_id, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 2 + 3. apply_rank_updates_for_game : un amoureux ne gagne QUE via
-- winner_team = 'amoureux' (jamais via le camp de son rôle d'origine), et
-- une victoire des amoureux donne +70 points d'impact. Reprise à
-- l'identique de 0205 pour tout le reste.
-- ----------------------------------------------------------------------------
create or replace function public.apply_rank_updates_for_game(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_won boolean; v_code text; v_total_rounds int; v_ratio numeric;
  v_impact jsonb; v_impact_bonus int; v_impact_details jsonb; v_result jsonb;
begin
  select code, greatest(night_number, 1) into v_code, v_total_rounds from public.games where id = p_game_id;

  for r in
    select gp.user_id, (rs.lover_with is not null) as is_lover, gp.died_at_night, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    -- Un amoureux forme son propre camp (3e camp, voir en-tête de migration) :
    -- il ne retombe JAMAIS sur le calcul de son rôle d'origine, contrairement
    -- à avant où seul le cas p_winner='amoureux' était traité à part (et
    -- tout le reste — mort en cours de partie compris — retombait sur le
    -- camp du rôle, donnant à tort des points de victoire à un amoureux
    -- mort de chagrin si son camp d'origine gagnait quand même).
    v_won := case
      when r.is_lover then (p_winner = 'amoureux')
      when p_winner = 'loups' then coalesce(r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'), false)
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'chasseuse'), true)
      when p_winner = 'anancy' then coalesce(r.role = 'anancy', false)
      when p_winner = 'ange' then coalesce(r.role = 'ange', false)
      when p_winner = 'chasseuse' then coalesce(r.role = 'chasseuse', false)
      else false
    end;

    v_ratio := case
      when r.died_at_night is null then 1.0
      else least(greatest(r.died_at_night::numeric / v_total_rounds, 0.4), 0.9)
    end;

    v_impact := public.compute_impact_bonus(p_game_id, r.user_id, r.role);
    v_impact_bonus := coalesce((v_impact->>'bonus')::int, 0);
    v_impact_details := coalesce(v_impact->'details', '[]'::jsonb);

    if p_winner = 'anancy' and v_won then
      v_impact_bonus := v_impact_bonus + 50;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'anancy_solo_win', 'points', 50);
    end if;

    if p_winner = 'loups' and v_won then
      v_impact_bonus := v_impact_bonus + 15;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'wolf_team_win', 'points', 15);
    end if;

    if p_winner = 'amoureux' and v_won then
      v_impact_bonus := v_impact_bonus + 70;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'lovers_win', 'points', 70);
    end if;

    v_result := public.apply_rank_result(r.user_id, v_won, v_ratio, v_impact_bonus);

    insert into public.game_results (
      game_id, user_id, code, role, is_lover, winner_team, won,
      points_gained, participation_ratio, impact_bonus, impact_details, new_rank_points, new_rank_tier,
      season_xp_gained
    )
    values (
      p_game_id, r.user_id, v_code, r.role, coalesce(r.is_lover, false), p_winner, v_won,
      (v_result->>'gain')::int, v_ratio, v_impact_bonus, v_impact_details,
      (v_result->>'new_points')::int, v_result->>'new_tier',
      coalesce((v_result->>'season_xp_gained')::int, 0)
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Salon de chat "amoureux" — privé aux deux amoureux, journée uniquement.
-- ----------------------------------------------------------------------------
alter table public.chat_messages drop constraint if exists chat_messages_channel_check;
alter table public.chat_messages add constraint chat_messages_channel_check
  check (channel in ('village', 'wolves', 'graveyard', 'amoureux'));

alter table public.chat_message_reactions drop constraint if exists chat_message_reactions_channel_check;
alter table public.chat_message_reactions add constraint chat_message_reactions_channel_check
  check (channel in ('village', 'wolves', 'graveyard', 'amoureux'));

create or replace function public.can_access_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_banned boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if;
  if v_banned then return false; end if;

  if p_channel = 'lobby' then
    return v_status in ('lobby', 'ended');
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    return v_alive and v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup');
  end if;

  if p_channel = 'amoureux' then
    if not v_alive or v_status not in ('day_reveal', 'day_discussion', 'day_vote') then
      return false;
    end if;
    return exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = auth.uid() and lover_with is not null
    );
  end if;

  return false;
end;
$$;

create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then
    -- Pas participant de la partie : peut-être un spectateur avec une
    -- demande de rejoindre en attente (voir get_spectator_game_view) —
    -- mêmes salons qu'un fantôme, en lecture seule uniquement.
    if p_channel in ('village', 'graveyard') and exists (
      select 1 from public.game_join_requests
      where game_id = p_game_id and user_id = auth.uid() and status = 'pending'
    ) then
      return true;
    end if;
    return false;
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
    else
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if v_status <> 'night' then
      return false;
    end if;
    if v_alive then
      select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
      return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup');
    end if;
    return exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = auth.uid() and sa.effect_key = 'parchemin_griot'
    );
  end if;

  if p_channel = 'amoureux' then
    if not v_alive or v_status not in ('day_reveal', 'day_discussion', 'day_vote') then
      return false;
    end if;
    return exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = auth.uid() and lover_with is not null
    );
  end if;

  return false;
end;
$$;

-- begin_night : vide aussi le salon "amoureux" à chaque nouvelle nuit,
-- comme village/loups (reprise à l'identique de 0180 pour tout le reste).
create or replace function public.begin_night(p_game_id uuid, p_night_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_first_step text;
  v_seconds int;
begin
  delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves', 'amoureux');

  v_first_step := public.next_night_step(p_game_id, p_night_number, null);
  v_seconds := public.step_duration_seconds(p_game_id, coalesce(v_first_step, 'resolve'));

  update public.games
  set status = 'night',
      night_number = p_night_number,
      night_step = coalesce(v_first_step, 'resolve'),
      phase_deadline = now() + make_interval(secs => v_seconds),
      night_deaths_resolved = false,
      anancy_swap_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🌙 La nuit ' || p_night_number || ' tombe sur le village. Tout le monde ferme les yeux...');
end;
$function$;
