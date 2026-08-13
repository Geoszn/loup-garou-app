-- ============================================================================
-- Système de récompenses "vas y" (proposition en 3 volets, validée par
-- l'utilisateur) :
--
-- 1. Icônes de profil débloquées par palier de rang (rank_points) :
--    avatar_icon_min_points(icon) reflète EXACTEMENT AVATAR_ICON_MIN_POINTS
--    côté client (src/lib/avatars.ts) — même principe que rank_tier_for_points
--    déjà synchronisé SQL <-> client. update_my_profile est réécrite pour
--    vérifier ce seuil avant d'accepter un changement d'icône.
--
--    Corrige au passage une régression pré-existante découverte pendant ce
--    travail : update_my_profile (0051) ne validait encore que les 10
--    icônes d'origine (0014), alors que la contrainte CHECK sur la colonne
--    et l'interface en autorisent 25 depuis 0040. Les 15 icônes les plus
--    récentes étaient donc rejetées ("Icône invalide.") pour tout le monde
--    en production, y compris pour les 8 icônes gratuites concernées.
--
-- 2. Cadre visuel autour de l'avatar en partie, qui monte en gamme avec le
--    palier de rang (voir PlayerGrid.tsx, tierRingClass) : get_my_game_view
--    doit renvoyer rank_tier pour CHAQUE joueur de la partie (pas seulement
--    pour soi), donc jointure sur profiles dans la construction de
--    `players`. Calculé en direct à chaque lecture, jamais stocké sur
--    game_players : reflète le rang actuel même s'il a changé depuis le
--    début de la partie.
--
-- 3. Titres de volume (parties jouées) : aucune donnée serveur nouvelle
--    nécessaire, get_my_stats renvoie déjà games_played — tout est calculé
--    côté client (voir src/lib/volumeTitles.ts).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1a. avatar_icon_min_points : seuil de rank_points nécessaire pour choisir
-- cette icône. Doit rester identique à AVATAR_ICON_MIN_POINTS
-- (src/lib/avatars.ts) — toute icône absente de la liste ci-dessous est
-- traitée comme invalide (0 icônes "gratuites implicites").
-- ----------------------------------------------------------------------------
create or replace function public.avatar_icon_min_points(p_icon text)
returns int
language sql
immutable
as $$
  select case p_icon
    when '🐺' then 0
    when '🌕' then 0
    when '🕯️' then 0
    when '🌲' then 0
    when '🏚️' then 0
    when '🛖' then 0
    when '🪶' then 0
    when '🌑' then 0
    when '🦇' then 100
    when '⚰️' then 100
    when '🔪' then 100
    when '👁️' then 250
    when '🕷️' then 250
    when '🐗' then 250
    when '🦉' then 600
    when '🐍' then 600
    when '🦂' then 600
    when '🥁' then 600
    when '🦁' then 1400
    when '🐆' then 1400
    when '🦅' then 1400
    when '🩸' then 1400
    when '🔥' then 2800
    when '⚡' then 2800
    when '⚔️' then 2800
    else null
  end
$$;

-- ----------------------------------------------------------------------------
-- 1b. update_my_profile : reprend 0051 (cooldown pseudo 7 jours), corrige la
-- liste d'icônes (25, pas 10) et ajoute la vérification du palier de rang.
-- ----------------------------------------------------------------------------
create or replace function public.update_my_profile(p_username text, p_avatar_icon text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_username text;
  v_current_username text;
  v_last_change timestamptz;
  v_next_allowed timestamptz;
  v_min_points int;
  v_my_points int;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  v_username := trim(p_username);
  if length(v_username) < 2 or length(v_username) > 24 then
    raise exception 'Le pseudo doit contenir entre 2 et 24 caractères.';
  end if;

  v_min_points := public.avatar_icon_min_points(p_avatar_icon);
  if v_min_points is null then
    raise exception 'Icône invalide.';
  end if;

  select username, username_changed_at, rank_points into v_current_username, v_last_change, v_my_points
  from public.profiles where id = v_user;

  if coalesce(v_my_points, 0) < v_min_points then
    raise exception 'Cette icône se débloque à % points de rang.', v_min_points;
  end if;

  -- Le cooldown ne s'applique que si le pseudo change réellement (comparaison
  -- insensible à la casse : "Loup" -> "loup" compte comme un changement,
  -- mais renvoyer le même pseudo tel quel dans le formulaire ne doit jamais
  -- déclencher ou consommer le cooldown).
  if v_username is distinct from v_current_username and lower(v_username) <> lower(coalesce(v_current_username, '')) and v_last_change is not null then
    v_next_allowed := v_last_change + interval '7 days';
    if now() < v_next_allowed then
      raise exception 'Vous avez déjà changé de pseudo récemment. Vous pourrez le modifier à nouveau le % à %.',
        to_char(v_next_allowed, 'DD/MM/YYYY'), to_char(v_next_allowed, 'HH24:MI');
    end if;
  end if;

  update public.profiles
  set
    username = v_username,
    avatar_icon = p_avatar_icon,
    username_changed_at = case
      when lower(v_username) <> lower(coalesce(v_current_username, '')) then now()
      else username_changed_at
    end
  where id = v_user;

  update public.game_players gp
  set display_name = v_username, avatar_icon = p_avatar_icon
  from public.games g
  where gp.game_id = g.id and gp.user_id = v_user and g.status = 'lobby';

  return jsonb_build_object('username', v_username, 'avatar_icon', p_avatar_icon);
end;
$$;

grant execute on function public.update_my_profile(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. get_my_game_view : reprise intégrale de 0073, `players` inclut
-- désormais rank_tier par joueur (jointure profiles -> rank_tier_for_points).
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
  v_wild_child_mentor uuid;
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
  select lover_with, wild_child_mentor into v_lover_id, v_wild_child_mentor
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
