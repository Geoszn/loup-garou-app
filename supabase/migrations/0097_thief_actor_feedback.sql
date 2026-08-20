-- ============================================================================
-- Retour utilisateur (test en prod, partie C4AH3Q) : le Voleur qui clique sur
-- "Voler une carte" n'a AUCUN retour visuel de ce qui vient de se passer — le
-- panneau d'action disparaît juste immédiatement (submit_voleur fait avancer
-- la phase dans la foulée, voir migration 0087), donnant l'impression que
-- "le système a sauté son tour" alors qu'il a bien agi (vérifié en base :
-- night_actions contient bien sa ligne, ~10s après le début de la nuit). La
-- VICTIME du vol recevait déjà ce genre de message ('thief_stole_my_card' /
-- 'thief_stole_my_new_role', voir migration 0087 + GameRoom.tsx), mais rien
-- d'équivalent n'existait côté Voleur lui-même.
--
-- Cette migration ajoute, dans le même game_log.meta déjà écrit par
-- submit_voleur, l'identité de l'acteur et son nouveau rôle (le rôle que la
-- victime avait avant l'échange) -- puis expose ça à get_my_game_view sous
-- deux nouveaux champs symétriques à ceux de la victime :
--   thief_i_stole (boolean) / thief_my_new_role (text)
-- ============================================================================
set search_path = public;

-- --- submit_voleur : meta enrichi avec actor_id + actor_new_role -----------
create or replace function public.submit_voleur(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_target uuid;
  v_my_role text;
  v_target_role text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'voleur' then
    raise exception 'Ce n''est pas le moment pour le Voleur.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'voleur' then
    raise exception 'Vous n''êtes pas le Voleur.';
  end if;
  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = v_game.night_number and step = 'voleur' and actor_id = v_user
  ) then
    raise exception 'Vous avez déjà agi.';
  end if;

  -- Cible tirée au sort parmi les autres joueurs vivants -- le Voleur ne
  -- choisit personne et ne voit jamais le rôle de sa cible avant l'échange.
  select user_id into v_target
  from public.game_players
  where game_id = p_game_id and is_alive and user_id <> v_user
  order by random()
  limit 1;

  if v_target is not null then
    select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
    select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = v_target;

    update public.game_roles_secret set role = v_target_role where game_id = p_game_id and user_id = v_user;
    update public.game_roles_secret set role = v_my_role where game_id = p_game_id and user_id = v_target;

    -- Message public inchangé et anonyme (voir migration 0087) ; le meta
    -- ci-dessous n'est lu que par get_my_game_view, pour la victime
    -- (victim_id/new_role, inchangé) ET pour l'acteur lui-même
    -- (actor_id/actor_new_role, nouveau).
    insert into public.game_log (game_id, message, night_number, kind, meta)
    values (
      p_game_id,
      '🃏 Le Voleur a fait son choix en secret.',
      v_game.night_number,
      'thief_swap',
      jsonb_build_object(
        'victim_id', v_target, 'new_role', v_my_role,
        'actor_id', v_user, 'actor_new_role', v_target_role
      )
    );
  else
    -- Cas limite (aucun autre joueur vivant) : ne devrait jamais se produire
    -- vu le minimum de 4 joueurs pour démarrer une partie, mais on reste
    -- défensif plutôt que de planter.
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '🃏 Le Voleur a fait son choix en secret.', v_game.night_number);
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, extra)
  values (p_game_id, v_game.night_number, 'voleur', v_user, jsonb_build_object('target_id', v_target))
  on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_voleur(uuid) to authenticated;

-- --- get_my_game_view : notifie aussi l'ACTEUR de son propre nouveau rôle --
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

    -- Personnel, voir migration 0087 : est-ce que MOI j'ai été la victime du
    -- Voleur (rôle volé à l'aveugle) -- pas de restriction de phase (donc
    -- visible dès que ça arrive, "immédiatement" comme demandé), le client
    -- limite lui-même l'affichage à la nuit où c'est arrivé (night_number
    -- reste celui de la nuit 1, le Voleur n'agissant qu'à cette nuit-là).
    'thief_stole_my_card', exists (
      select 1 from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = v_user
    ),
    'thief_stole_my_new_role', (
      select meta->>'new_role' from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = v_user
      order by created_at desc limit 1
    ),

    -- Personnel, nouveau (migration 0097) : symétrique au champ ci-dessus,
    -- mais pour MOI en tant qu'ACTEUR du vol (le Voleur lui-même) -- sans ça,
    -- il n'a aucune confirmation de ce qu'il vient de faire (voir en-tête de
    -- fichier).
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

grant execute on function public.get_my_game_view(uuid) to authenticated;
