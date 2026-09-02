-- ----------------------------------------------------------------------------
-- Mode de test solo : un pool réutilisable de 12 comptes "bot" que l'hôte
-- (admin uniquement) peut ajouter à un salon d'attente, puis faire jouer
-- automatiquement (choix aléatoires valides) via un bouton dédié, pour
-- tester une partie sans avoir à recruter de vrais joueurs.
--
-- Décisions de conception (confirmées avec l'utilisateur) :
--  1. Faux joueurs réutilisables (un pool fixe, pas des comptes jetables).
--  2. Bouton "Faire jouer les bots" — un clic résout TOUS les bots en
--     attente d'un choix pour l'étape EN COURS uniquement, puis s'arrête
--     (jamais d'enchaînement automatique de plusieurs étapes) : l'hôte
--     garde la main pour avancer à son rythme et observer chaque étape.
--  3. Réservé à l'admin (is_admin_user) — jamais exposé aux autres hôtes.
--
-- Comportement des bots, volontairement simplifié pour rester prévisible :
--  - Votes (Capitaine, village) : cible vivante aléatoire, jamais eux-mêmes.
--  - Voyante / Griot / Enfant Sauvage : cible vivante aléatoire, jamais eux-
--    mêmes (même contrainte que les vraies fonctions submit_*).
--  - Loups (loup_garou, y compris Alpha/Sans-Visage/Grand Méchant Loup pour
--    le vote de meute) : cible vivante aléatoire NON-loup. L'Alpha bot
--    n'utilise JAMAIS l'infection (toujours "éliminer") — tester cette
--    mécanique précise nécessite un vrai compte.
--  - Grand Méchant Loup (seconde victime) : ~60% de chances d'agir si une
--    cible valide existe, sinon passe son tour.
--  - Sorcière : ne fait jamais rien (aucune potion) — comportement neutre
--    et prévisible par défaut.
--  - Cupidon : deux cibles vivantes distinctes aléatoires, jamais eux-mêmes.
--  - Anancy : ~50% de chances d'échanger deux joueurs vivants aléatoires
--    (jamais lui-même, jamais un joueur déjà touché), sinon ne rien faire.
--  - Voleur : déjà aléatoire par nature (voir submit_voleur existant),
--    logique reprise à l'identique.
--  - Chasseur (à sa mort) / succession du Capitaine : cible vivante
--    aléatoire.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. Marqueur de compte bot.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists is_bot boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. Pool de 12 comptes bot réutilisables — de vraies lignes auth.users
-- (nécessaire : profiles.id référence auth.users(id), voir profiles_id_fkey)
-- mais qui ne se connecteront jamais réellement ; le trigger existant
-- on_auth_user_created (handle_new_user) crée automatiquement la ligne
-- profiles correspondante à partir de raw_user_meta_data.username.
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'authenticated', 'authenticated',
  'bot' || n || '@bots.loupgarouafrique.internal',
  now(),
  '{"provider":"bot","providers":["bot"]}'::jsonb,
  jsonb_build_object('username', 'Bot ' || n),
  false, true, now(), now()
from generate_series(1, 12) as n
on conflict (id) do nothing;

with bot_ids as (
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid as id
  from generate_series(1, 12) as n
),
bot_icons as (
  select id, (array['🐺','🌕','🦇','🕯️','⚰️','🔪','🩸','👁️','🌲','🏚️','🦉','🕷️'])[row_number() over (order by id)] as icon
  from bot_ids
)
update public.profiles p
set is_bot = true,
    avatar_icon = bi.icon
from bot_icons bi
where p.id = bi.id;

-- ----------------------------------------------------------------------------
-- 3. get_leaderboard : exclut les bots (ils accumulent des parties de test,
-- ne devraient jamais apparaître dans un classement de vrais joueurs).
-- ----------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_limit integer DEFAULT 20)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  with scores as (
    select
      gp.user_id,
      case
        when g.winner_team = 'amoureux' then gp.is_lover
        when g.winner_team = 'loups' then rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
        when g.winner_team = 'village' then coalesce(rs.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy'), true)
        when g.winner_team = 'anancy' then coalesce(rs.role = 'anancy', false)
        when g.winner_team = 'ange' then coalesce(rs.role = 'ange', false)
        else false
      end as won
    from public.game_players gp
    join public.games g on g.id = gp.game_id and g.status = 'ended'
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
  ),
  agg as (
    select
      user_id,
      count(*) as games_played,
      count(*) filter (where won) as games_won
    from scores
    group by user_id
    having count(*) >= 3
  ),
  ranked as (
    select
      p.id as user_id,
      p.username,
      p.avatar_icon,
      a.games_played,
      a.games_won,
      round(100.0 * a.games_won / a.games_played, 1) as win_rate
    from agg a
    join public.profiles p on p.id = a.user_id
    where not p.is_bot
    order by win_rate desc, a.games_played desc
    limit greatest(p_limit, 0)
  )
  select coalesce(jsonb_agg(row_to_json(ranked)), '[]'::jsonb) from ranked;
$$;

-- ----------------------------------------------------------------------------
-- 4. admin_add_bot : ajoute un bot du pool (pas déjà dans CETTE partie) au
-- salon d'attente.
-- ----------------------------------------------------------------------------
create or replace function public.admin_add_bot(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_bot_id uuid;
  v_bot_username text;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.status <> 'lobby' then raise exception 'Impossible d''ajouter un bot une fois la partie commencée.'; end if;

  select p.id, p.username into v_bot_id, v_bot_username
  from public.profiles p
  where p.is_bot
    and not exists (select 1 from public.game_players gp where gp.game_id = p_game_id and gp.user_id = p.id)
  order by p.username
  limit 1;

  if v_bot_id is null then
    raise exception 'Tous les bots disponibles sont déjà dans cette partie.';
  end if;

  perform public._add_player_to_game(p_game_id, v_bot_id, '🤖 ' || v_bot_username);

  return jsonb_build_object('user_id', v_bot_id);
end;
$$;

grant execute on function public.admin_add_bot(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. admin_remove_bot : retire un bot du salon (jamais un vrai joueur, même
-- si l'appelant essayait de forcer un id).
-- ----------------------------------------------------------------------------
create or replace function public.admin_remove_bot(p_game_id uuid, p_bot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

  select status into v_status from public.games where id = p_game_id;
  if v_status is distinct from 'lobby' then
    raise exception 'Impossible de retirer un bot une fois la partie commencée.';
  end if;

  if not exists (select 1 from public.profiles where id = p_bot_id and is_bot) then
    raise exception 'Ce joueur n''est pas un bot.';
  end if;

  delete from public.game_players where game_id = p_game_id and user_id = p_bot_id;
end;
$$;

grant execute on function public.admin_remove_bot(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. admin_auto_play_bots : résout tous les bots en attente d'un choix pour
-- l'étape EN COURS (une seule étape par appel, voir commentaire d'en-tête).
-- ----------------------------------------------------------------------------
create or replace function public.admin_auto_play_bots(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_bot record;
  v_target uuid;
  v_target2 uuid;
  v_target_arr uuid[];
  v_my_role text;
  v_target_role text;
  v_wolf_target uuid;
  v_acted int := 0;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;

  -- Chasseur bot en attente de tirer.
  if v_game.hunter_pending is not null and exists (
    select 1 from public.profiles where id = v_game.hunter_pending and is_bot
  ) then
    select user_id into v_target from public.game_players
    where game_id = p_game_id and is_alive and user_id <> v_game.hunter_pending
    order by random() limit 1;

    if v_target is not null then
      perform public.kill_player(p_game_id, v_target, 'chasseur', v_game.night_number);
    else
      insert into public.game_log (game_id, message)
      select p_game_id, gp.display_name || ' (Chasseur) choisit de ne tirer sur personne.'
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_game.hunter_pending;
    end if;

    update public.games set hunter_pending = null, hunter_context = null where id = p_game_id;
    perform public.advance_phase(p_game_id, true);
    return jsonb_build_object('acted', 1);
  end if;

  -- Capitaine bot mourant devant désigner un successeur.
  if v_game.captain_pending is not null and exists (
    select 1 from public.profiles where id = v_game.captain_pending and is_bot
  ) then
    select user_id into v_target from public.game_players
    where game_id = p_game_id and is_alive and user_id <> v_game.captain_pending
    order by random() limit 1;

    if v_target is not null then
      update public.game_players set is_captain = false where game_id = p_game_id and user_id = v_game.captain_pending;
      update public.game_players set is_captain = true where game_id = p_game_id and user_id = v_target;
      insert into public.game_log (game_id, message)
      select p_game_id, '🎖️ ' || gp.display_name || ' devient le nouveau Capitaine.'
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_target;
    end if;

    update public.games set captain_pending = null where id = p_game_id;
    perform public.advance_phase(p_game_id, true);
    return jsonb_build_object('acted', 1);
  end if;

  -- Élection du Capitaine.
  if v_game.status = 'captain_election' then
    for v_bot in
      select gp.user_id from public.game_players gp
      join public.profiles p on p.id = gp.user_id
      where gp.game_id = p_game_id and gp.is_alive and p.is_bot
        and not exists (
          select 1 from public.votes where game_id = p_game_id and round_number = 0 and voter_id = gp.user_id
        )
    loop
      select user_id into v_target from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
      order by random() limit 1;

      insert into public.votes (game_id, round_number, voter_id, target_id)
      values (p_game_id, 0, v_bot.user_id, v_target)
      on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;
      v_acted := v_acted + 1;
    end loop;
    if v_acted > 0 then perform public.advance_phase(p_game_id, true); end if;
    return jsonb_build_object('acted', v_acted);
  end if;

  -- Vote du village.
  if v_game.status = 'day_vote' then
    for v_bot in
      select gp.user_id from public.game_players gp
      join public.profiles p on p.id = gp.user_id
      where gp.game_id = p_game_id and gp.is_alive and p.is_bot
        and not exists (
          select 1 from public.votes where game_id = p_game_id and round_number = v_game.night_number and voter_id = gp.user_id
        )
    loop
      select user_id into v_target from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
      order by random() limit 1;

      insert into public.votes (game_id, round_number, voter_id, target_id)
      values (p_game_id, v_game.night_number, v_bot.user_id, v_target)
      on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;
      v_acted := v_acted + 1;
    end loop;
    if v_acted > 0 then perform public.advance_phase(p_game_id, true); end if;
    return jsonb_build_object('acted', v_acted);
  end if;

  -- Nuit : une seule étape active à la fois.
  if v_game.status = 'night' then
    for v_bot in
      select gp.user_id, rs.role
      from public.game_players gp
      join public.profiles p on p.id = gp.user_id
      join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
      where gp.game_id = p_game_id and gp.is_alive and p.is_bot
        and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.night_step = 'loup_garou'))
        and not exists (
          select 1 from public.night_actions
          where game_id = p_game_id and night_number = v_game.night_number
            and step = v_game.night_step and actor_id = gp.user_id
        )
    loop
      if v_game.night_step = 'voleur' then
        select user_id into v_target from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
        order by random() limit 1;

        if v_target is not null then
          select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_bot.user_id;
          select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = v_target;

          update public.game_roles_secret set role = v_target_role where game_id = p_game_id and user_id = v_bot.user_id;
          update public.game_roles_secret set role = v_my_role where game_id = p_game_id and user_id = v_target;

          insert into public.game_log (game_id, message, night_number, kind, meta)
          values (
            p_game_id, '🃏 Le Voleur a fait son choix en secret.', v_game.night_number, 'thief_swap',
            jsonb_build_object('victim_id', v_target, 'new_role', v_my_role, 'actor_id', v_bot.user_id, 'actor_new_role', v_target_role)
          );
        else
          insert into public.game_log (game_id, message, night_number)
          values (p_game_id, '🃏 Le Voleur a fait son choix en secret.', v_game.night_number);
        end if;

        insert into public.night_actions (game_id, night_number, step, actor_id, extra)
        values (p_game_id, v_game.night_number, 'voleur', v_bot.user_id, jsonb_build_object('target_id', v_target))
        on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

      elsif v_game.night_step = 'cupidon' then
        select array_agg(user_id) into v_target_arr from (
          select user_id from public.game_players
          where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
          order by random() limit 2
        ) t;

        if coalesce(array_length(v_target_arr, 1), 0) = 2 then
          update public.game_players set is_lover = false where game_id = p_game_id;
          update public.game_roles_secret set lover_with = null where game_id = p_game_id;

          update public.game_players set is_lover = true where game_id = p_game_id and user_id = any(v_target_arr);
          update public.game_roles_secret set lover_with = v_target_arr[2] where game_id = p_game_id and user_id = v_target_arr[1];
          update public.game_roles_secret set lover_with = v_target_arr[1] where game_id = p_game_id and user_id = v_target_arr[2];

          insert into public.game_log (game_id, message) values (p_game_id, '💘 Cupidon a décoché ses flèches...');

          insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
          values (p_game_id, v_game.night_number, 'cupidon', v_bot.user_id, v_target_arr[1], jsonb_build_object('lover2', v_target_arr[2]))
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id, extra = excluded.extra;
        end if;

      elsif v_game.night_step = 'enfant_sauvage' then
        select user_id into v_target from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
        order by random() limit 1;

        if v_target is not null then
          update public.game_roles_secret set wild_child_mentor = v_target
          where game_id = p_game_id and user_id = v_bot.user_id;

          insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
          values (p_game_id, v_game.night_number, 'enfant_sauvage', v_bot.user_id, v_target)
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

          insert into public.game_log (game_id, message) values (p_game_id, '🐾 L''Enfant Sauvage a choisi son mentor en secret.');
        end if;

      elsif v_game.night_step in ('voyante', 'griot') then
        select user_id into v_target from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
        order by random() limit 1;

        if v_target is not null then
          insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
          values (p_game_id, v_game.night_number, v_game.night_step, v_bot.user_id, v_target)
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

          if v_game.night_step = 'voyante' then
            insert into public.game_log (game_id, message) values (p_game_id, '🔮 La Voyante a sondé un joueur en secret.');
          end if;
        end if;

      elsif v_game.night_step = 'loup_garou' then
        select gp.user_id into v_target
        from public.game_players gp
        join public.game_roles_secret rs2 on rs2.game_id = gp.game_id and rs2.user_id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive
          and rs2.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
        order by random() limit 1;

        insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
        values (p_game_id, v_game.night_number, 'loup_garou', v_bot.user_id, v_target)
        on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

      elsif v_game.night_step = 'grand_mechant_loup' then
        v_target := null;
        if random() < 0.6 then
          v_wolf_target := public.get_wolf_target(p_game_id, v_game.night_number);
          select gp.user_id into v_target
          from public.game_players gp
          join public.game_roles_secret rs2 on rs2.game_id = gp.game_id and rs2.user_id = gp.user_id
          where gp.game_id = p_game_id and gp.is_alive
            and rs2.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
            and (v_wolf_target is null or gp.user_id <> v_wolf_target)
          order by random() limit 1;
        end if;

        insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
        values (p_game_id, v_game.night_number, 'grand_mechant_loup', v_bot.user_id, v_target)
        on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

      elsif v_game.night_step = 'sorciere' then
        insert into public.night_actions (game_id, night_number, step, actor_id, extra)
        values (p_game_id, v_game.night_number, 'sorciere', v_bot.user_id, jsonb_build_object('heal', false, 'poison_target', null))
        on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

        insert into public.game_log (game_id, message) values (p_game_id, '🧪 La Sorcière a fait son choix en secret.');

      elsif v_game.night_step = 'anancy' then
        v_target := null;
        v_target2 := null;
        if random() < 0.5 then
          select array_agg(user_id) into v_target_arr from (
            select gp.user_id from public.game_players gp
            where gp.game_id = p_game_id and gp.is_alive and gp.user_id <> v_bot.user_id
              and not exists (
                select 1 from public.anancy_swapped_players asp
                where asp.game_id = p_game_id and asp.user_id = gp.user_id
              )
            order by random() limit 2
          ) t;

          if coalesce(array_length(v_target_arr, 1), 0) = 2 then
            v_target := v_target_arr[1];
            v_target2 := v_target_arr[2];
            insert into public.anancy_swapped_players (game_id, user_id, swapped_at_night)
            values (p_game_id, v_target, v_game.night_number + 1), (p_game_id, v_target2, v_game.night_number + 1);
          end if;
        end if;

        insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
        values (p_game_id, v_game.night_number, 'anancy', v_bot.user_id, v_target, jsonb_build_object('target2', v_target2))
        on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id, extra = excluded.extra;
      end if;

      v_acted := v_acted + 1;
    end loop;

    if v_acted > 0 then perform public.advance_phase(p_game_id, true); end if;
    return jsonb_build_object('acted', v_acted);
  end if;

  return jsonb_build_object('acted', 0);
end;
$$;

grant execute on function public.admin_auto_play_bots(uuid) to authenticated;
