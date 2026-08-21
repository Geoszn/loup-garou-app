-- RÉGRESSION CORRIGÉE : le bouton "Infecter" du Loup Alpha avait disparu
-- côté client. Cause racine trouvée en comparant l'historique des
-- migrations : la migration 0097 (thief_actor_feedback, plus tôt dans cette
-- session) a réécrit get_my_game_view() à partir d'une copie de base qui ne
-- contenait PAS encore les 6 champs liés à l'infection du Loup Alpha
-- (ajoutés en 0093/0095/0096) — un simple copier-coller parti d'une version
-- trop ancienne du fichier. Toutes les migrations suivantes (0098, 0099,
-- 0100, 0101) ont ensuite chacune fait `create or replace` par-dessus cette
-- base déjà amputée, sans jamais réintroduire ces champs : côté client,
-- `view.alpha_infect_available` valait donc `undefined` pour tout le monde
-- depuis 0097, faisant disparaître silencieusement toute la section
-- d'infection dans WolfPanel (conditionnée sur ce champ).
--
-- Correctif : réintroduit les 6 champs (copiés à l'identique depuis 0096,
-- dernière version connue où ils étaient corrects) dans la définition
-- ACTUELLE de get_my_game_view (celle d'après 0101, qui contient tous les
-- autres ajouts légitimes depuis : thief_i_stole, seer camp-only, wild
-- child...). Rien d'autre ne change.

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

    'wild_child_conversion_this_round', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night = v_game.night_number
    ),

    -- Les 6 champs ci-dessous avaient disparu depuis la migration 0097 (voir
    -- commentaire en tête de fichier) : réintroduits à l'identique.
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

    'alpha_infect_available', v_my_role in ('loup_garou', 'loup_alpha')
      and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      and public.role_alive_exists(p_game_id, 'loup_alpha')
      and not coalesce((
        select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha'
      ), false),

    'alpha_infect_agreed_ids', case
      when v_my_role in ('loup_garou', 'loup_alpha') and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      then coalesce((
        select jsonb_agg(user_id) from public.alpha_infect_agreements
        where game_id = p_game_id and night_number = v_game.night_number
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,

    'alpha_infect_confirmed', case
      when v_my_role in ('loup_garou', 'loup_alpha') and v_game.status = 'night' and v_game.night_step = 'loup_garou'
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

grant execute on function public.get_my_game_view(uuid) to authenticated;
