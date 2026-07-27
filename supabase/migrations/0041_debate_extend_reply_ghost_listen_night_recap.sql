-- ============================================================================
-- Lot de 4 améliorations indépendantes, regroupées dans une seule migration :
--
--   1. extend_phase_deadline : bouton discret de l'hôte pour rallonger le
--      débat de 30s à chaque appui (day_discussion uniquement).
--
--   2. Réponse à un message précis dans le chat (reply_to_message_id sur
--      chat_messages) : send_chat_message accepte désormais un
--      p_reply_to optionnel.
--
--   3. Récap de nuit (statut 'day_reveal') transformé en vraie pop-up
--      "prêt à continuer", même patron que day_vote_recap/vote_recap_ready
--      (migration 0027) : nouvelle table day_reveal_ready +
--      submit_day_reveal_ready. Durée par défaut relevée de 15s à 30s
--      (role_reveal_seconds dans create_game).
--
--   4. can_listen_channel : les fantômes peuvent désormais rejoindre le
--      salon vocal du village en écoute (jamais en émission — l'appli
--      cliente ne leur propose tout simplement jamais de bouton pour
--      s'activer, même principe de confiance client que le mute à distance
--      de l'hôte, déjà purement côté client). can_access_channel, lui,
--      reste inchangé : il continue de refuser aux fantômes toute ÉCRITURE
--      dans le chat du village (send_chat_message s'appuie toujours dessus).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. extend_phase_deadline
-- ----------------------------------------------------------------------------
create or replace function public.extend_phase_deadline(p_game_id uuid, p_seconds int default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_add int := greatest(5, least(120, p_seconds));
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> auth.uid() then raise exception 'Seul l’hôte peut prolonger le débat.'; end if;
  if v_game.status <> 'day_discussion' then raise exception 'Le débat n’est pas en cours.'; end if;
  if v_game.phase_deadline is null then raise exception 'Aucun minuteur en cours.'; end if;

  update public.games
  set phase_deadline = greatest(phase_deadline, now()) + make_interval(secs => v_add)
  where id = p_game_id;
end;
$$;

grant execute on function public.extend_phase_deadline(uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Réponse à un message dans le chat
-- ----------------------------------------------------------------------------
alter table public.chat_messages
  add column if not exists reply_to_message_id uuid references public.chat_messages (id) on delete set null;

create or replace function public.send_chat_message(p_game_id uuid, p_channel text, p_content text, p_reply_to uuid default null)
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

  -- Le message cité doit exister, appartenir à la même partie et au même
  -- salon — sinon on l'ignore silencieusement plutôt que de faire échouer
  -- tout l'envoi pour une référence obsolète (message depuis rechargé hors
  -- fenêtre des 200 derniers, salon changé entre-temps, etc.).
  if p_reply_to is not null then
    select id into v_reply_to from public.chat_messages
    where id = p_reply_to and game_id = p_game_id and channel = p_channel;
  end if;

  select blocked_words into v_blocked_words from public.games where id = p_game_id;
  if exists (
    select 1 from unnest(coalesce(v_blocked_words, '{}'::text[])) w
    where char_length(w) > 0 and position(lower(w) in lower(v_content)) > 0
  ) then
    raise exception 'Message refusé : il contient un mot bloqué par l’hôte.';
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
-- 3. Récap de nuit en pop-up "prêt à continuer" (statut day_reveal)
-- ----------------------------------------------------------------------------
create table if not exists public.day_reveal_ready (
  game_id uuid not null references public.games (id) on delete cascade,
  round_number int not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, round_number, user_id)
);

alter table public.day_reveal_ready enable row level security;

create or replace function public.submit_day_reveal_ready(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive_count int;
  v_ready_count int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'day_reveal' then
    raise exception 'Le récap de la nuit n''est plus affiché.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Seuls les joueurs vivants participent au récap.';
  end if;

  insert into public.day_reveal_ready (game_id, round_number, user_id)
  values (p_game_id, v_game.night_number, v_user)
  on conflict (game_id, round_number, user_id) do nothing;

  select count(*) into v_alive_count from public.game_players where game_id = p_game_id and is_alive;
  select count(*) into v_ready_count
  from public.day_reveal_ready where game_id = p_game_id and round_number = v_game.night_number;

  if v_alive_count > 0 and v_ready_count >= v_alive_count then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$$;

grant execute on function public.submit_day_reveal_ready(uuid) to authenticated;

-- restart_game : reprise pour nettoyer aussi day_reveal_ready.
create or replace function public.restart_game(p_game_id uuid)
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
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut relancer une partie.'; end if;
  if v_game.status <> 'ended' then raise exception 'La partie n’est pas terminée.'; end if;

  delete from public.game_players where game_id = p_game_id and is_banned;

  delete from public.game_roles_secret where game_id = p_game_id;
  delete from public.night_actions where game_id = p_game_id;
  delete from public.votes where game_id = p_game_id;
  delete from public.vote_call_agreements where game_id = p_game_id;
  delete from public.vote_recap_ready where game_id = p_game_id;
  delete from public.day_reveal_ready where game_id = p_game_id;
  delete from public.chat_messages where game_id = p_game_id;
  delete from public.game_log where game_id = p_game_id;

  update public.game_players
  set is_alive = true, death_cause = null, died_at_night = null, is_lover = false, revealed_role = null,
      is_captain = false, is_ready = false
  where game_id = p_game_id;

  update public.games
  set status = 'lobby',
      night_number = 0,
      night_step = null,
      phase_deadline = null,
      winner_team = null,
      hunter_pending = null,
      hunter_context = null,
      captain_pending = null,
      last_vote_captain_id = null,
      night_deaths_resolved = false,
      day_vote_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🔄 Une nouvelle partie va commencer avec le même groupe !');
end;
$$;

-- create_game : reprise pour relever role_reveal_seconds (durée du récap de
-- nuit) de 15s à 30s par défaut — toujours volontairement non exposé dans
-- les réglages de l'hôte (voir Lobby.tsx), ce n'est pas une phase d'attente
-- qu'on personnalise, juste un défaut plus confortable.
create or replace function public.create_game(p_display_name text, p_settings jsonb default null)
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
    'role_reveal_seconds', coalesce((p_settings->>'role_reveal_seconds')::int, 30),
    'role_counts', p_settings->'role_counts'
  );

  insert into public.games (code, host_id, settings)
  values (v_code, v_user, v_settings)
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 1, true, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game_id, 'La partie a été créée. En attente des joueurs...');

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

-- get_my_game_view : reprise pour exposer les joueurs déjà prêts à continuer
-- pendant le récap de nuit (day_reveal), même principe que vote_recap plus
-- bas (day_vote_recap) — un seul champ ready_ids suffit ici, tout le reste
-- du récap (le journal de la nuit) est déjà exposé via `log`.
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

    'little_girl_wolves', case
      when v_my_role = 'petite_fille' and exists (
        select 1 from public.night_actions
        where game_id = p_game_id and actor_id = v_user and step = 'petite_fille'
          and night_number = v_game.night_number
          and (extra->>'peek')::boolean = true and (extra->>'caught')::boolean = false
      ) then coalesce((
        select jsonb_agg(rs.user_id)
        from public.game_roles_secret rs where rs.game_id = p_game_id and rs.role = 'loup_garou'
      ), '[]'::jsonb)
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

    'day_reveal_ready_ids', case when v_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(user_id) from public.day_reveal_ready
      where game_id = p_game_id and round_number = v_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'vote_recap', case when v_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb)
    ) else null end,

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

-- ----------------------------------------------------------------------------
-- 4. can_listen_channel : ouvre le vocal du village aux fantômes, en écoute
-- seule côté client (voir VoiceChat.tsx / useVoiceChat.ts, prop listenOnly).
-- Utilisée uniquement pour l'attribution du salon vocal Daily (api/daily-room.ts)
-- — can_access_channel, elle, reste la seule autorité pour le texte écrit.
-- ----------------------------------------------------------------------------
create or replace function public.can_listen_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_banned boolean;
begin
  if p_channel <> 'village' then
    return public.can_access_channel(p_game_id, p_channel);
  end if;

  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if;
  if v_banned then return false; end if;

  if v_alive then
    return v_status in ('day_reveal', 'day_discussion', 'day_vote');
  end if;

  -- fantôme : peut écouter le village dès qu'il y a effectivement du vocal
  -- côté vivants (mêmes phases), à tout moment de la partie.
  return v_status in ('day_reveal', 'day_discussion', 'day_vote');
end;
$$;

grant execute on function public.can_listen_channel(uuid, text) to authenticated;
