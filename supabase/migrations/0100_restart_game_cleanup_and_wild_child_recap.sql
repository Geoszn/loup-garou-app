-- ============================================================================
-- Deux corrections liées au redémarrage de partie ("Rejouer avec ce groupe"
-- / redémarrage modérateur), demande utilisateur :
--
-- 1. restart_game ne vidait pas la table alpha_infect_agreements (créée en
--    migration 0093, après la dernière version de restart_game en 0070). Sa
--    clé primaire est (game_id, night_number, user_id) -- comme restart_game
--    NE change PAS l'id de la partie (même ligne `games` réutilisée) et
--    remet night_number à 0, une nouvelle partie qui rejoue jusqu'à la nuit
--    1 avec le Loup Alpha actif retomberait exactement sur les mêmes clés
--    que la partie précédente, laissées en base -- au mieux des accords
--    fantômes affichés à tort dès le début de la nuit, au pire une
--    violation de contrainte d'unicité selon le chemin emprunté. Corrigé en
--    ajoutant cette table à la liste déjà vidée (night_actions, votes...).
--
-- 2. Enfant Sauvage -> Loup-Garou : l'annonce publique anonyme existait déjà
--    dans le journal (game_log, migration 0077) et apparaissait donc déjà
--    dans le récap de nuit (night_recap) quand la conversion survient suite
--    à une mort DE NUIT. Mais si le mentor meurt lynché par le village (vote
--    de jour), aucun écran de récap de jour (VoteRecapModal) n'affichait
--    quoi que ce soit à ce sujet -- ce cas restait invisible pour tout le
--    monde. Nouveau champ public 'wild_child_conversion_this_round' :
--    vrai si une conversion a eu lieu PENDANT LE ROUND EN COURS (nuit ou
--    jour, night_number étant réutilisé comme numéro de round dans les
--    deux cas) -- ne révèle ni qui ni son ancien rôle, exploité par
--    NightRecapModal ET VoteRecapModal.
-- ============================================================================
set search_path = public;

-- --- restart_game : vide aussi alpha_infect_agreements ----------------------
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
  if v_game.status = 'lobby' then raise exception 'La partie n’a pas encore commencé.'; end if;

  delete from public.game_players where game_id = p_game_id and is_banned;

  delete from public.game_roles_secret where game_id = p_game_id;
  delete from public.night_actions where game_id = p_game_id;
  delete from public.votes where game_id = p_game_id;
  delete from public.vote_call_agreements where game_id = p_game_id;
  delete from public.vote_recap_ready where game_id = p_game_id;
  delete from public.day_reveal_ready where game_id = p_game_id;
  delete from public.chat_messages where game_id = p_game_id;
  delete from public.game_log where game_id = p_game_id;
  -- Voir en-tête de fichier : table ajoutée en 0093, jamais nettoyée par
  -- restart_game jusqu'ici (même game_id réutilisé, même night_number
  -- possible d'une partie à l'autre -> collision de clé primaire).
  delete from public.alpha_infect_agreements where game_id = p_game_id;

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

-- --- get_my_game_view : + wild_child_conversion_this_round (public) --------
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

    'wild_child_conversion_occurred', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night is not null
    ),

    -- Nouveau (migration 0100) : public, mais borné au round affiché sur
    -- l'écran de récap en cours (nuit OU vote de jour, night_number sert de
    -- numéro de round dans les deux cas) -- contrairement au champ
    -- game-entier ci-dessus, celui-ci redevient faux une fois le round
    -- passé, pour ne pas laisser croire qu'une conversion vient d'avoir
    -- lieu à chaque récap ultérieur. Voir en-tête de fichier : couvre le
    -- cas où le mentor meurt lynché de jour, jusqu'ici invisible dans
    -- VoteRecapModal.
    'wild_child_conversion_this_round', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night = v_game.night_number
    ),

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

    'wolf_teammates', case when v_my_role = 'loup_garou' then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'loup_garou' and rs.user_id <> v_user
    ), '[]'::jsonb) else null end,

    'seer_reveals', case when v_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', case when rs.role in ('loup_garou', 'loup_alpha') then 'loup_garou' else 'villageois' end,
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

grant execute on function public.restart_game(uuid) to authenticated;
grant execute on function public.get_my_game_view(uuid) to authenticated;
