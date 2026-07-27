-- ============================================================================
-- Deux nouveaux rôles : l'Ancien et le Voleur.
--
-- Ancien (village, passif) :
--   - Survit à la première attaque des Loups-Garous (pas à la Sorcière, pas
--     au vote, pas au Chasseur) — une seule vie supplémentaire, trackée dans
--     game_roles_secret.ancien_extra_life_used.
--   - S'il est éliminé par le VOTE du village (le village s'est trompé), les
--     pouvoirs du village s'éteignent : plus de Voyante, Sorcière, Petite
--     Fille ni de tir de Chasseur pour le reste de la partie
--     (games.village_powers_disabled). Les Loups-Garous ne sont pas affectés.
--
-- Voleur (village, action unique en tout début de partie) :
--   - Deux cartes supplémentaires sont mises de côté au moment de la
--     distribution (simplification volontaire : toujours une carte
--     Loup-Garou + une carte Villageois, plutôt que de piocher dans le
--     paquet réellement configuré — ça garantit un vrai dilemme "rejoindre
--     les loups ou rester au village" sans complexifier la répartition).
--   - À la nuit 1, avant même Cupidon, le Voleur voit ces deux cartes et
--     peut échanger la sienne contre l'une d'elles (ou la garder). S'il
--     devient Loup-Garou, il rejoint la meute dès cette même nuit.
-- ============================================================================
set search_path = public;

alter table public.games add column if not exists village_powers_disabled boolean not null default false;
alter table public.games add column if not exists thief_extra_roles text[];

alter table public.game_roles_secret add column if not exists ancien_extra_life_used boolean not null default false;

alter table public.games drop constraint if exists games_night_step_check;
alter table public.games add constraint games_night_step_check
  check (night_step in ('voleur','cupidon','voyante','loup_garou','sorciere','petite_fille','resolve'));

-- ----------------------------------------------------------------------------
-- compute_default_role_counts : les deux nouveaux rôles restent désactivés
-- par défaut dans les petites parties (ils ajoutent une vraie complexité de
-- règles) et ne s'activent automatiquement que pour les grandes tablées.
-- ----------------------------------------------------------------------------
create or replace function public.compute_default_role_counts(p_player_count int)
returns jsonb
language plpgsql
as $$
declare
  v_wolves int;
begin
  v_wolves := greatest(1, round(p_player_count * 0.25));
  if v_wolves >= p_player_count then
    v_wolves := greatest(1, p_player_count / 2);
  end if;
  return jsonb_build_object(
    'loup_garou', v_wolves,
    'voyante', p_player_count >= 5,
    'sorciere', p_player_count >= 6,
    'chasseur', p_player_count >= 7,
    'petite_fille', p_player_count >= 8,
    'cupidon', p_player_count >= 9,
    'ancien', p_player_count >= 10,
    'voleur', p_player_count >= 11
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- start_game : reprise pour distribuer ancien/voleur et, si le Voleur est
-- activé, préparer les deux cartes supplémentaires.
-- ----------------------------------------------------------------------------
create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_players uuid[];
  v_count int;
  v_role_counts jsonb;
  v_roles text[] := array[]::text[];
  v_shuffled text[];
  v_special_total int;
  v_seconds int;
  v_thief_extra text[];
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut démarrer la partie.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  select array_agg(user_id order by seat_number) into v_players
  from public.game_players where game_id = p_game_id;

  v_count := coalesce(array_length(v_players, 1), 0);
  if v_count < 4 then raise exception 'Il faut au moins 4 joueurs pour commencer.'; end if;
  if v_count > 20 then raise exception 'Une partie ne peut pas dépasser 20 joueurs.'; end if;

  v_role_counts := v_game.settings -> 'role_counts';
  if v_role_counts is null or v_role_counts = 'null'::jsonb then
    v_role_counts := public.compute_default_role_counts(v_count);
  end if;

  v_special_total := (v_role_counts->>'loup_garou')::int
    + (v_role_counts->>'voyante')::boolean::int
    + (v_role_counts->>'sorciere')::boolean::int
    + (v_role_counts->>'chasseur')::boolean::int
    + (v_role_counts->>'petite_fille')::boolean::int
    + (v_role_counts->>'cupidon')::boolean::int
    + coalesce((v_role_counts->>'ancien')::boolean::int, 0)
    + coalesce((v_role_counts->>'voleur')::boolean::int, 0);

  if (v_role_counts->>'loup_garou')::int < 1 then
    raise exception 'Il faut au moins un Loup-Garou.';
  end if;
  if v_special_total > v_count then
    raise exception 'La configuration des rôles dépasse le nombre de joueurs.';
  end if;

  for i in 1..(v_role_counts->>'loup_garou')::int loop
    v_roles := v_roles || 'loup_garou'::text;
  end loop;
  if (v_role_counts->>'voyante')::boolean then v_roles := v_roles || 'voyante'::text; end if;
  if (v_role_counts->>'sorciere')::boolean then v_roles := v_roles || 'sorciere'::text; end if;
  if (v_role_counts->>'chasseur')::boolean then v_roles := v_roles || 'chasseur'::text; end if;
  if (v_role_counts->>'petite_fille')::boolean then v_roles := v_roles || 'petite_fille'::text; end if;
  if (v_role_counts->>'cupidon')::boolean then v_roles := v_roles || 'cupidon'::text; end if;
  if coalesce((v_role_counts->>'ancien')::boolean, false) then v_roles := v_roles || 'ancien'::text; end if;
  if coalesce((v_role_counts->>'voleur')::boolean, false) then
    v_roles := v_roles || 'voleur'::text;
    v_thief_extra := array['loup_garou', 'villageois'];
  end if;

  while coalesce(array_length(v_roles, 1), 0) < v_count loop
    v_roles := v_roles || 'villageois'::text;
  end loop;

  select array_agg(r order by random()) into v_shuffled from unnest(v_roles) r;

  for i in 1..v_count loop
    insert into public.game_roles_secret (game_id, user_id, role)
    values (p_game_id, v_players[i], v_shuffled[i]);
  end loop;

  select coalesce((v_game.settings->>'role_reveal_seconds')::int, 15) into v_seconds;

  update public.games
  set status = 'role_reveal',
      night_number = 0,
      night_step = null,
      phase_deadline = now() + make_interval(secs => v_seconds),
      settings = jsonb_set(settings, '{role_counts}', v_role_counts),
      thief_extra_roles = v_thief_extra,
      village_powers_disabled = false
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🎭 Les rôles ont été distribués en secret. Regardez votre carte...');
end;
$$;

-- ----------------------------------------------------------------------------
-- next_night_step : ajoute le Voleur en tête de la nuit 1, et saute les
-- pouvoirs du village (Voyante/Sorcière/Petite Fille) s'ils ont été perdus.
-- ----------------------------------------------------------------------------
create or replace function public.next_night_step(p_game_id uuid, p_night_number int, p_current text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence text[];
  v_idx int := 0;
  v_found_current boolean := (p_current is null);
  v_step text;
  v_powers_disabled boolean;
begin
  select village_powers_disabled into v_powers_disabled from public.games where id = p_game_id;

  if p_night_number <= 1 then
    v_sequence := array['voleur','cupidon','voyante','loup_garou','sorciere','petite_fille'];
  else
    v_sequence := array['voyante','loup_garou','sorciere','petite_fille'];
  end if;

  foreach v_step in array v_sequence loop
    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;

    if v_step in ('voyante','sorciere','petite_fille') and coalesce(v_powers_disabled, false) then
      continue;
    end if;

    if public.role_alive_exists(p_game_id, v_step) then
      return v_step;
    end if;
  end loop;

  return null; -- plus d'étape : direction résolution
end;
$$;

-- ----------------------------------------------------------------------------
-- kill_player : reprise pour le bouclier de l'Ancien contre les loups, et la
-- perte des pouvoirs du village s'il est lynché par erreur.
-- ----------------------------------------------------------------------------
create or replace function public.kill_player(p_game_id uuid, p_user_id uuid, p_cause text, p_night int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
  v_is_lover boolean;
  v_lover_id uuid;
  v_ancien_used boolean;
begin
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

  if p_cause = 'loup_garou' and v_role = 'ancien' then
    select ancien_extra_life_used into v_ancien_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if not coalesce(v_ancien_used, false) and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = p_user_id and is_alive
    ) then
      update public.game_roles_secret set ancien_extra_life_used = true
      where game_id = p_game_id and user_id = p_user_id;

      insert into public.game_log (game_id, message)
      select p_game_id, gp.display_name || ' (Ancien) encaisse l’attaque des Loups-Garous et s’accroche à la vie !'
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = p_user_id;

      return;
    end if;
  end if;

  update public.game_players
  set is_alive = false, death_cause = p_cause, died_at_night = p_night, revealed_role = v_role
  where game_id = p_game_id and user_id = p_user_id and is_alive = true
  returning display_name, is_lover into v_name, v_is_lover;

  if v_name is null then
    return; -- déjà mort, rien à faire
  end if;

  insert into public.game_log (game_id, message)
  values (p_game_id, v_name || ' (' || public.role_display_name(v_role) || ') ' || public.death_phrase(p_cause) );

  if v_role = 'ancien' and p_cause = 'vote' then
    update public.games set village_powers_disabled = true where id = p_game_id;
    insert into public.game_log (game_id, message)
    values (p_game_id, '⚖️ Le village a eu tort de lyncher l’Ancien : ses pouvoirs spéciaux s’éteignent pour le reste de la partie...');
  end if;

  if v_is_lover then
    select lover_with into v_lover_id from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
    if v_lover_id is not null and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = v_lover_id and is_alive
    ) then
      perform public.kill_player(p_game_id, v_lover_id, 'chagrin', p_night);
    end if;
  end if;

  if v_role = 'chasseur' then
    update public.games
    set hunter_pending = p_user_id,
        hunter_context = case when status = 'day_vote' then 'day' else 'night' end
    where id = p_game_id and hunter_pending is null and not village_powers_disabled;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_voleur : le Voleur garde sa carte ou l'échange contre l'une des
-- deux cartes supplémentaires.
-- ----------------------------------------------------------------------------
create or replace function public.submit_voleur(p_game_id uuid, p_swap_role text default null)
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
  if not found or v_game.status <> 'night' or v_game.night_step <> 'voleur' then
    raise exception 'Ce n’est pas le moment pour le Voleur.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'voleur' then
    raise exception 'Vous n’êtes pas le Voleur.';
  end if;

  if p_swap_role is not null then
    if not (p_swap_role = any(coalesce(v_game.thief_extra_roles, array[]::text[]))) then
      raise exception 'Carte invalide.';
    end if;
    update public.game_roles_secret set role = p_swap_role
    where game_id = p_game_id and user_id = v_user;
  end if;

  update public.games set thief_extra_roles = null where id = p_game_id;

  insert into public.night_actions (game_id, night_number, step, actor_id, extra)
  values (p_game_id, v_game.night_number, 'voleur', v_user, jsonb_build_object('swapped', p_swap_role is not null))
  on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

  -- Le message reste volontairement neutre : jamais dire au village ce que
  -- le Voleur a choisi.
  insert into public.game_log (game_id, message) values (p_game_id, '🃏 Le Voleur a fait son choix en secret.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_voleur(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_game_view : reprise pour exposer thief_extra_roles UNIQUEMENT au
-- Voleur lui-même. Important : games.thief_extra_roles est retiré du
-- `to_jsonb(v_game)` générique avant de le renvoyer, sinon les deux cartes
-- supplémentaires fuiteraient vers tous les joueurs de la partie pendant la
-- fenêtre de décision du Voleur (le champ brut de la table games ne doit
-- jamais transiter tel quel).
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

    'pending_action_required', case
      when v_game.hunter_pending = v_user then 'hunter'
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
