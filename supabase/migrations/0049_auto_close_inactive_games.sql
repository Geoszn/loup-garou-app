-- ============================================================================
-- Fermeture automatique des salons inactifs depuis plus de 2h.
--
-- Pas de tâche planifiée côté serveur (pg_cron n'est pas activé sur ce
-- projet, et l'activer serait une dépendance supplémentaire à gérer) : la
-- fermeture se déclenche plutôt de façon "paresseuse", au premier appel de
-- get_my_game_view qui suit le délai — cette fonction est déjà interrogée
-- en continu par TOUT client ayant l'onglet ouvert sur une partie, salon
-- (lobby) compris (voir useGame.ts, l'intervalle de sécurité de 2.5s tourne
-- quel que soit le statut). Limite connue : si absolument personne n'a
-- l'app ouverte sur ce salon, rien ne déclenche la vérification et il reste
-- "actif" en base jusqu'au prochain passage de quelqu'un — sans
-- conséquence pratique (personne ne le voit tourner dans le vide), mais à
-- garder en tête si un jour il faut un ménage garanti même sans aucun
-- visiteur (solution : activer pg_cron et appeler cette même logique
-- toutes les X minutes).
-- ============================================================================
set search_path = public;

alter table public.games add column if not exists last_activity_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- touch_game_activity : remet le compteur à zéro à chaque évènement qui
-- prouve qu'il y a un humain actif dans le salon — message de chat, vote,
-- action de nuit, nouveau joueur, ou toute ligne du journal de partie (qui
-- couvre déjà la plupart des transitions de phase, morts, etc.). Sous
-- forme de trigger plutôt que d'un appel ajouté dans chaque fonction
-- (create_game, submit_vote, send_chat_message, submit_wolf_vote, ...) :
-- une vingtaine d'endroits différents à ne jamais oublier de mettre à jour
-- sinon le système redevient silencieusement obsolète à la première
-- fonction de jeu ajoutée plus tard sans y penser.
-- ----------------------------------------------------------------------------
create or replace function public.touch_game_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.games set last_activity_at = now() where id = coalesce(new.game_id, old.game_id);
  return new;
end;
$$;

drop trigger if exists trg_touch_activity_game_log on public.game_log;
create trigger trg_touch_activity_game_log
  after insert on public.game_log
  for each row execute function public.touch_game_activity();

drop trigger if exists trg_touch_activity_chat_messages on public.chat_messages;
create trigger trg_touch_activity_chat_messages
  after insert on public.chat_messages
  for each row execute function public.touch_game_activity();

drop trigger if exists trg_touch_activity_votes on public.votes;
create trigger trg_touch_activity_votes
  after insert on public.votes
  for each row execute function public.touch_game_activity();

drop trigger if exists trg_touch_activity_night_actions on public.night_actions;
create trigger trg_touch_activity_night_actions
  after insert on public.night_actions
  for each row execute function public.touch_game_activity();

drop trigger if exists trg_touch_activity_game_players on public.game_players;
create trigger trg_touch_activity_game_players
  after insert on public.game_players
  for each row execute function public.touch_game_activity();

-- ----------------------------------------------------------------------------
-- get_my_game_view : reprise intégrale de 0044_fix_get_my_game_view_regression.sql
-- (dernière version en date), avec un seul ajout — le contrôle de fermeture
-- automatique juste après avoir chargé la ligne de la partie. Si le délai
-- est dépassé, la partie passe à 'ended' immédiatement, AVANT de construire
-- le reste de la réponse : la personne qui vient de déclencher ce contrôle
-- voit donc tout de suite le salon comme terminé, sans attendre un
-- prochain rafraîchissement.
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

  if v_game.status <> 'ended' and v_game.last_activity_at < now() - interval '2 hours' then
    update public.games set status = 'ended' where id = p_game_id;
    insert into public.game_log (game_id, message)
    values (p_game_id, 'La partie a été fermée automatiquement après 2h d''inactivité.');
    v_game.status := 'ended';
  end if;

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

-- ----------------------------------------------------------------------------
-- admin_list_active_games : reprise de 0048_admin_rpcs.sql, ajoute
-- last_activity_at pour que l'onglet "Salons" du dashboard montre depuis
-- combien de temps un salon est vraiment silencieux (et donc à combien de
-- temps il est de la fermeture automatique).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_active_games(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(g)) from (
      select
        gm.id,
        gm.code,
        gm.status,
        gm.is_public,
        gm.created_at,
        gm.last_activity_at,
        hp.display_name as host_name,
        (select count(*) from public.game_players gp2 where gp2.game_id = gm.id) as player_count
      from public.games gm
      join public.game_players hp on hp.game_id = gm.id and hp.user_id = gm.host_id
      where gm.status <> 'ended'
      order by gm.created_at desc
      limit p_limit
    ) g
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_active_games(int) to authenticated;
