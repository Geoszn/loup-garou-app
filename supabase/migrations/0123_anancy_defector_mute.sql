-- ----------------------------------------------------------------------------
-- Demande utilisateur : quand l'échange d'Anancy fait sortir un joueur du
-- camp des Loups (il redevient villageois ou autre chose), ce joueur garde
-- en mémoire l'identité de ses anciens coéquipiers loups — rien ne
-- l'empêchait jusqu'ici de les dénoncer immédiatement au village avec une
-- crédibilité de "simple villageois" (la Voyante et le reste du village ne
-- voient que son nouveau rôle). Pour éviter cette trahison à retardement
-- déloyale, ce joueur est désormais rendu muet au village — ni écrire, ni
-- parler — pendant la nuit où l'échange prend effet ET la journée qui
-- suit, jusqu'à ce que la nuit suivante commence.
--
-- Aucun changement pour la direction inverse (un villageois qui DEVIENT
-- loup) : il n'a aucun secret d'ex-coéquipiers à trahir, rien à museler.
-- ----------------------------------------------------------------------------

alter table public.game_roles_secret
  add column if not exists village_muted_until_night integer;

-- ----------------------------------------------------------------------------
-- 1. begin_night : en plus d'appliquer l'échange différé d'Anancy (voir
-- migration 0122), détecte si l'un des deux joueurs concernés vient de
-- quitter le camp des Loups et le rend muet pour cette nuit + le jour qui
-- suit (village_muted_until_night = p_night_number, la nuit qui démarre).
-- ----------------------------------------------------------------------------

create or replace function public.begin_night(p_game_id uuid, p_night_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_step text;
  v_seconds int;
  v_pending_target1 uuid;
  v_pending_target2 uuid;
  v_role1 text;
  v_role2 text;
  v_wolf_roles text[] := array['loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'];
begin
  -- Applique l'échange de rôles d'Anancy DE LA NUIT PRÉCÉDENTE, maintenant
  -- seulement (voir migration 0122).
  select target_id, nullif(extra->>'target2', '')::uuid
  into v_pending_target1, v_pending_target2
  from public.night_actions
  where game_id = p_game_id and night_number = p_night_number - 1 and step = 'anancy' and target_id is not null
  limit 1;

  if v_pending_target1 is not null and v_pending_target2 is not null then
    select role into v_role1 from public.game_roles_secret where game_id = p_game_id and user_id = v_pending_target1;
    select role into v_role2 from public.game_roles_secret where game_id = p_game_id and user_id = v_pending_target2;

    update public.game_roles_secret set role = v_role2 where game_id = p_game_id and user_id = v_pending_target1;
    update public.game_roles_secret set role = v_role1 where game_id = p_game_id and user_id = v_pending_target2;

    -- Celui qui QUITTE le camp des Loups (loup avant, plus loup après) est
    -- rendu muet au village — jamais celui qui le rejoint, qui n'a aucun
    -- secret d'ex-coéquipier à trahir.
    if v_role1 = any(v_wolf_roles) and not (v_role2 = any(v_wolf_roles)) then
      update public.game_roles_secret set village_muted_until_night = p_night_number
      where game_id = p_game_id and user_id = v_pending_target1;
    elsif v_role2 = any(v_wolf_roles) and not (v_role1 = any(v_wolf_roles)) then
      update public.game_roles_secret set village_muted_until_night = p_night_number
      where game_id = p_game_id and user_id = v_pending_target2;
    end if;
  end if;

  delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

  v_first_step := public.next_night_step(p_game_id, p_night_number, null);
  v_seconds := public.step_duration_seconds(p_game_id, coalesce(v_first_step, 'resolve'));

  update public.games
  set status = 'night',
      night_number = p_night_number,
      night_step = coalesce(v_first_step, 'resolve'),
      phase_deadline = now() + make_interval(secs => v_seconds),
      night_deaths_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🌙 La nuit ' || p_night_number || ' tombe sur le village. Tout le monde ferme les yeux...');
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. send_chat_message : refuse l'écriture dans le salon 'village' pendant
-- la fenêtre de mutisme (les deux signatures existantes doivent rester
-- cohérentes). La lecture (can_read_channel) n'est volontairement PAS
-- touchée : le joueur muet continue de voir ce qui se dit.
-- ----------------------------------------------------------------------------

create or replace function public.send_chat_message(p_game_id uuid, p_channel text, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_status text;
  v_content text := trim(p_content);
  v_anonymous boolean;
  v_message_id uuid;
  v_blocked_words text[];
  v_night_number int;
  v_muted_until int;
begin
  if v_content = '' then
    return;
  end if;
  if char_length(v_content) > 500 then
    v_content := left(v_content, 500);
  end if;

  if not public.can_access_channel(p_game_id, p_channel) then
    raise exception 'Ce salon n''est pas ouvert en ce moment.';
  end if;

  if p_channel = 'village' then
    select night_number into v_night_number from public.games where id = p_game_id;
    select village_muted_until_night into v_muted_until
    from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
    if v_muted_until is not null and v_muted_until = v_night_number then
      raise exception 'Le destin vous a rendu muet au village jusqu''à la prochaine nuit.';
    end if;
  end if;

  select blocked_words into v_blocked_words from public.games where id = p_game_id;
  if exists (
    select 1 from unnest(coalesce(v_blocked_words, '{}'::text[])) w
    where char_length(w) > 0 and position(lower(w) in lower(v_content)) > 0
  ) then
    raise exception 'Message refusé : il contient un mot bloqué par l''hôte.';
  end if;

  select status into v_status from public.games where id = p_game_id;
  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  v_anonymous := (p_channel = 'village' and v_status = 'night');

  if v_anonymous then
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous)
    values (p_game_id, p_channel, null, null, v_content, true)
    returning id into v_message_id;

    insert into public.chat_message_identities (message_id, game_id, user_id, display_name)
    values (v_message_id, p_game_id, v_user, v_name);
  else
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous)
    values (p_game_id, p_channel, v_user, v_name, v_content, false);
  end if;
end;
$$;

create or replace function public.send_chat_message(p_game_id uuid, p_channel text, p_content text, p_reply_to uuid DEFAULT NULL::uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_status text;
  v_content text := trim(p_content);
  v_anonymous boolean;
  v_message_id uuid;
  v_blocked_words text[];
  v_reply_to uuid := null;
  v_night_number int;
  v_muted_until int;
begin
  if v_content = '' then
    return;
  end if;
  if char_length(v_content) > 500 then
    v_content := left(v_content, 500);
  end if;

  if not public.can_access_channel(p_game_id, p_channel) then
    raise exception 'Ce salon n''est pas ouvert en ce moment.';
  end if;

  if p_channel = 'village' then
    select night_number into v_night_number from public.games where id = p_game_id;
    select village_muted_until_night into v_muted_until
    from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
    if v_muted_until is not null and v_muted_until = v_night_number then
      raise exception 'Le destin vous a rendu muet au village jusqu''à la prochaine nuit.';
    end if;
  end if;

  if p_reply_to is not null then
    select id into v_reply_to from public.chat_messages
    where id = p_reply_to and game_id = p_game_id and channel = p_channel;
  end if;

  select blocked_words into v_blocked_words from public.games where id = p_game_id;
  if exists (
    select 1 from unnest(coalesce(v_blocked_words, '{}'::text[])) w
    where char_length(w) > 0 and position(lower(w) in lower(v_content)) > 0
  ) then
    raise exception 'Message refusé : il contient un mot bloqué par l''hôte.';
  end if;

  select status into v_status from public.games where id = p_game_id;
  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  v_anonymous := (p_channel = 'village' and v_status = 'night');

  if v_anonymous then
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous, reply_to_message_id)
    values (p_game_id, p_channel, null, null, v_content, true, v_reply_to)
    returning id into v_message_id;

    insert into public.chat_message_identities (message_id, game_id, user_id, display_name)
    values (v_message_id, p_game_id, v_user, v_name);
  else
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous, reply_to_message_id)
    values (p_game_id, p_channel, v_user, v_name, v_content, false, v_reply_to);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. get_my_game_view : expose 'village_muted' pour que le client masque le
-- formulaire de chat et force le vocal en écoute seule (VoiceChat.tsx
-- réutilise déjà exactement ce mécanisme pour les fantômes, via sa prop
-- `listenOnly`).
-- ----------------------------------------------------------------------------

create or replace function public.get_my_game_view(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_my_role text;
  v_my_alive boolean;
  v_lover_id uuid;
  v_wild_child_mentor uuid;
  v_my_muted_until int;
  v_result jsonb;
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select * into v_game from public.games where id = p_game_id;

  if v_game.status <> 'ended' and v_game.last_activity_at < now() - interval '2 hours' then
    update public.games set status = 'ended' where id = p_game_id;
    insert into public.game_log (game_id, message)
    values (p_game_id, 'La partie a été fermée automatiquement après 2h d''inactivité.');
    v_game.status := 'ended';
  end if;

  select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  select is_alive into v_my_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select lover_with, wild_child_mentor, village_muted_until_night into v_lover_id, v_wild_child_mentor, v_my_muted_until
  from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  select jsonb_build_object(
    'game', to_jsonb(v_game) - 'thief_extra_roles',

    'players', coalesce((
      select jsonb_agg(
        to_jsonb(gp) || jsonb_build_object('rank_tier', public.rank_tier_for_points(coalesce(pr.rank_points, 0)))
        order by gp.seat_number
      )
      from public.game_players gp
      left join public.profiles pr on pr.id = gp.user_id
      where gp.game_id = p_game_id
    ), '[]'::jsonb),

    'my_role', v_my_role,
    'my_alive', coalesce(v_my_alive, false),
    'lover_id', v_lover_id,
    'wild_child_mentor', v_wild_child_mentor,

    'village_muted', coalesce(v_my_muted_until = v_game.night_number, false),

    'mentee_ids', coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'enfant_sauvage' and rs.wild_child_mentor = v_user
    ), '[]'::jsonb),

    'witch_saved_me', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_log
      where game_id = p_game_id and night_number = v_game.night_number and kind = 'witch_heal'
        and (meta->>'target_user_id')::uuid = v_user
    ) else false end,

    'witch_poisoned_me', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_players
      where game_id = p_game_id and user_id = v_user
        and death_cause = 'sorciere' and died_at_night = v_game.night_number
    ) else false end,

    'wild_child_turned_wolf', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = v_user and wild_child_turned_at_night = v_game.night_number
    ) else false end,

    'wild_child_conversion_occurred', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night is not null
    ),

    'wild_child_conversion_this_round', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night = v_game.night_number
    ),

    'alpha_infected_me', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = v_user and infected_at_night = v_game.night_number
    ) else false end,

    'alpha_infection_occurred', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and role = 'loup_alpha' and alpha_infect_used = true
    ),

    'alpha_infect_used', case when v_my_role = 'loup_alpha' then (
      select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user
    ) else null end,

    'alpha_infect_available', v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
      and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      and public.role_alive_exists(p_game_id, 'loup_alpha')
      and not coalesce((
        select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha'
      ), false),

    'alpha_infect_agreed_ids', case
      when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      then coalesce((
        select jsonb_agg(user_id) from public.alpha_infect_agreements
        where game_id = p_game_id and night_number = v_game.night_number
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,

    'alpha_infect_confirmed', case
      when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      then exists (
        select 1 from public.night_actions
        where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_alpha_confirm'
          and (extra->>'confirmed')::boolean is true
      )
      else false
    end,

    'thief_stole_my_card', exists (
      select 1 from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = v_user
    ),
    'thief_stole_my_new_role', (
      select meta->>'new_role' from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = v_user
      order by created_at desc limit 1
    ),

    'thief_i_stole', exists (
      select 1 from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'actor_id')::uuid = v_user
    ),
    'thief_my_new_role', (
      select meta->>'actor_new_role' from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'actor_id')::uuid = v_user
      order by created_at desc limit 1
    ),

    'my_impact_preview', case
      when not coalesce(v_my_alive, false) and v_game.status <> 'ended' and v_my_role is not null
      then public.compute_impact_bonus(p_game_id, v_user, v_my_role)
      else null
    end,

    'my_game_result', case when v_game.status = 'ended' then (
      select jsonb_build_object(
        'points_gained', gr.points_gained,
        'participation_ratio', gr.participation_ratio,
        'impact_bonus', gr.impact_bonus,
        'impact_details', gr.impact_details,
        'new_rank_points', gr.new_rank_points,
        'new_rank_tier', gr.new_rank_tier,
        'won', gr.won
      )
      from public.game_results gr
      where gr.game_id = p_game_id and gr.user_id = v_user
      order by gr.created_at desc limit 1
    ) else null end,

    'wolf_teammates', case when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and rs.user_id <> v_user
    ), '[]'::jsonb) else null end,

    'wolf_alpha_id', case when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') then (
      select rs.user_id from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'loup_alpha'
      limit 1
    ) else null end,

    'seer_reveals', case when v_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', case when rs.role in ('loup_garou', 'loup_alpha', 'grand_mechant_loup') then 'loup_garou' else 'villageois' end,
        'night_number', na.night_number
      ) order by na.night_number)
      from public.night_actions na
      join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
      where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = v_user
    ), '[]'::jsonb) else null end,

    'griot_reveals', case when v_my_role = 'griot' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'night_number', na.night_number,
        'kind', public.compute_griot_phrase(p_game_id, na.target_id, na.night_number - 1)
      ) order by na.night_number)
      from public.night_actions na
      where na.game_id = p_game_id and na.step = 'griot' and na.actor_id = v_user
    ), '[]'::jsonb) else null end,

    'anancy_swapped_me', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.anancy_swapped_players
      where game_id = p_game_id and user_id = v_user and swapped_at_night = v_game.night_number
    ) else false end,

    'anancy_used_target_ids', case when v_my_role = 'anancy' then coalesce((
      select jsonb_agg(user_id) from public.anancy_swapped_players where game_id = p_game_id
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

    'wolf_current_votes', case when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.status = 'night' and v_game.night_step = 'loup_garou' then coalesce((
      select jsonb_agg(jsonb_build_object('actor_id', actor_id, 'target_id', target_id))
      from public.night_actions
      where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou'
    ), '[]'::jsonb) else null end,

    'wolf_night_recap', case
      when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.status = 'day_reveal' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'actor_id', na.actor_id,
          'actor_name', gp.display_name,
          'is_alpha', rs.role = 'loup_alpha',
          'target_id', na.target_id,
          'target_name', tgp.display_name,
          'chose_infect', exists (
            select 1 from public.alpha_infect_agreements aia
            where aia.game_id = p_game_id and aia.night_number = v_game.night_number and aia.user_id = na.actor_id
          )
        ) order by (rs.role = 'loup_alpha') desc, gp.display_name)
        from public.night_actions na
        join public.game_players gp on gp.game_id = na.game_id and gp.user_id = na.actor_id
        join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.actor_id
        left join public.game_players tgp on tgp.game_id = na.game_id and tgp.user_id = na.target_id
        where na.game_id = p_game_id and na.night_number = v_game.night_number and na.step = 'loup_garou'
      ), '[]'::jsonb)
      else null
    end,

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

    'day_reveal_ready_ids', case when v_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(user_id) from public.day_reveal_ready
      where game_id = p_game_id and round_number = v_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'night_recap', case when v_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message) order by created_at asc)
      from public.game_log
      where game_id = p_game_id and night_number = v_game.night_number
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
      'captain_voter_id', v_game.last_vote_captain_id,
      'captain_random_notice', (
        select message from public.game_log
        where game_id = p_game_id and night_number = v_game.night_number and kind = 'captain_random'
        order by created_at desc limit 1
      )
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
      when v_game.status = 'night' and v_my_alive
        and (v_my_role = v_game.night_step or (v_my_role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.night_step = 'loup_garou'))
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
$function$;
