-- ============================================================================
-- Refonte du flux de vote des loups (demande utilisateur) :
--
-- 1) BUG CORRIGÉ : la majorité nécessaire pour débloquer l'infection
--    comptait le Loup Alpha lui-même parmi les loups dont l'accord est
--    requis. Avec 1 Alpha + 1 loup simple, ça demandait 2 accords (les
--    deux), pas 1 — alors que le principe est "les AUTRES loups décident,
--    l'Alpha n'a pas voix à sa propre permission". Corrigé dans les deux
--    endroits qui comptent (submit_loup_alpha_confirm_infect,
--    resolve_night_deaths) : le calcul ne porte plus que sur les loups
--    'loup_garou' vivants, jamais 'loup_alpha'.
--
-- 2) Nouveau flux voulu côté client (ActionPanel.tsx, pas de changement SQL
--    nécessaire pour celui-ci — voir le commentaire du composant) :
--    - Un loup simple qui choisit "Infecter" n'a plus à désigner de
--      victime : il envoie un vote vide (submit_wolf_vote avec cible null,
--      déjà le mécanisme d'abstention existant) + son accord d'infection.
--      Il ne pèse donc plus dans le dépouillement de cible
--      (get_wolf_target, inchangé), seul l'Alpha continue de choisir QUI —
--      exactement la règle demandée ("les loups ne peuvent pas choisir qui
--      ils décident d'infecter").
--    - L'Alpha, lui, ne voit plus l'étape "choisir infecter ou éliminer" :
--      il désigne toujours une cible dès le début (comme avant cette
--      refonte), et peut en plus confirmer l'infection une fois la
--      majorité des loups simples atteinte — la cible déjà désignée
--      devient alors la victime de l'infection au lieu de l'élimination.
--
-- 3) get_my_game_view : deux champs avaient dérivé de la migration 0093
--    d'origine sans qu'on s'en aperçoive (corrigé directement en base par
--    une intervention ponctuelle depuis — voir l'historique) :
--    - wolf_current_votes ne couvrait que 'loup_garou', jamais
--      'loup_alpha' : l'Alpha ne voyait donc jamais le décompte des votes
--      de la meute dans son propre panneau.
--    - pending_action_required ne signalait jamais le tour de l'Alpha
--      pendant l'étape 'loup_garou' (il compare le rôle au nom de l'étape
--      littéralement, et 'loup_alpha' ≠ 'loup_garou').
--    Les deux sont restaurés ici avec la même règle que l'original.
--
-- 4) submit_alpha_infect_agreement : n'accepte plus que 'loup_garou'
--    (jusqu'ici 'loup_garou' OU 'loup_alpha'). Le client ne laisse déjà
--    plus l'Alpha appeler cette fonction (voir ActionPanel.tsx), mais nos
--    propres règles de sécurité imposent de ne jamais compter sur la
--    discipline du client seul : sans ce garde-fou, un appel direct de
--    l'Alpha aurait gonflé v_agreed (compté sans filtre par rôle dans
--    submit_loup_alpha_confirm_infect / resolve_night_deaths) et permis de
--    contourner la majorité des loups simples qu'on vient de corriger
--    ci-dessus.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- submit_alpha_infect_agreement : réservée aux loups simples désormais.
-- ----------------------------------------------------------------------------
create or replace function public.submit_alpha_infect_agreement(p_game_id uuid, p_agree boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_role text;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n''est pas le moment pour cette décision.';
  end if;
  if not public.role_alive_exists(p_game_id, 'loup_alpha') then
    raise exception 'Cette partie n''a pas de Loup Alpha.';
  end if;

  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  if v_role <> 'loup_garou' then
    raise exception 'Seuls les loups simples participent à cette décision.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  if p_agree then
    insert into public.alpha_infect_agreements (game_id, night_number, user_id)
    values (p_game_id, v_game.night_number, v_user)
    on conflict (game_id, night_number, user_id) do nothing;
  else
    delete from public.alpha_infect_agreements
    where game_id = p_game_id and night_number = v_game.night_number and user_id = v_user;
  end if;
end;
$$;

grant execute on function public.submit_alpha_infect_agreement(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- submit_loup_alpha_confirm_infect : majorité des loups SIMPLES vivants
-- uniquement (l'Alpha exclu du calcul).
-- ----------------------------------------------------------------------------
create or replace function public.submit_loup_alpha_confirm_infect(p_game_id uuid, p_confirm boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive_wolves int;
  v_agreed int;
  v_needed int;
  v_used boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n''est pas le moment pour cette décision.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'loup_alpha' then
    raise exception 'Vous n''êtes pas le Loup Alpha.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  select alpha_infect_used into v_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  if coalesce(v_used, false) then
    raise exception 'Vous avez déjà utilisé votre infection.';
  end if;

  if p_confirm then
    select count(*) into v_alive_wolves
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'loup_garou' and gp.is_alive;

    select count(*) into v_agreed
    from public.alpha_infect_agreements
    where game_id = p_game_id and night_number = v_game.night_number;

    v_needed := case when v_alive_wolves = 0 then 0 else v_alive_wolves / 2 + 1 end;
    if v_agreed < v_needed then
      raise exception 'La majorité des loups doit être d''accord avant que vous puissiez infecter.';
    end if;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, extra)
  values (p_game_id, v_game.night_number, 'loup_alpha_confirm', v_user, jsonb_build_object('confirmed', p_confirm))
  on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;
end;
$$;

-- ----------------------------------------------------------------------------
-- resolve_night_deaths : même correction de majorité.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_night_deaths(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_night int;
  v_final_victim uuid;
  v_wolf_mode text := 'eliminate';
  v_heal boolean;
  v_poison_target uuid;
  v_deaths_before int;
  v_deaths_after int;
  v_infected boolean := false;
  v_alpha_used boolean;
  v_alive_wolves int;
  v_agreed int;
  v_needed int;
  v_alpha_confirmed boolean;
begin
  select night_number into v_night from public.games where id = p_game_id;

  v_final_victim := public.get_wolf_target(p_game_id, v_night);

  if public.role_alive_exists(p_game_id, 'loup_alpha') then
    select alpha_infect_used into v_alpha_used
    from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha';

    if not coalesce(v_alpha_used, false) then
      select count(*) into v_alive_wolves
      from public.game_roles_secret rs
      join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
      where rs.game_id = p_game_id and rs.role = 'loup_garou' and gp.is_alive;

      select count(*) into v_agreed
      from public.alpha_infect_agreements
      where game_id = p_game_id and night_number = v_night;

      v_needed := case when v_alive_wolves = 0 then 0 else v_alive_wolves / 2 + 1 end;

      select exists (
        select 1 from public.night_actions
        where game_id = p_game_id and night_number = v_night and step = 'loup_alpha_confirm'
          and (extra->>'confirmed')::boolean is true
      ) into v_alpha_confirmed;

      if v_agreed >= v_needed and v_alpha_confirmed then
        v_wolf_mode := 'infect';
      end if;
    end if;
  end if;

  select (extra->>'heal')::boolean, nullif(extra->>'poison_target','')::uuid
  into v_heal, v_poison_target
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'sorciere'
  limit 1;

  select count(*) into v_deaths_before from public.game_players where game_id = p_game_id and died_at_night = v_night;

  if v_wolf_mode = 'eliminate' and v_heal is true and v_final_victim is not null then
    insert into public.game_log (game_id, message, night_number, kind, meta)
    values (
      p_game_id,
      '🧪 La Sorcière a utilisé sa potion de guérison pour sauver la victime des loups.',
      v_night,
      'witch_heal',
      jsonb_build_object('target_user_id', v_final_victim)
    );
    update public.game_roles_secret set heal_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
    v_final_victim := null;
  end if;

  if v_final_victim is not null then
    if v_wolf_mode = 'infect' then
      perform public.infect_player(p_game_id, v_final_victim, v_night);
      v_infected := true;
    else
      perform public.kill_player(p_game_id, v_final_victim, 'loup_garou', v_night);
    end if;
  end if;

  if v_poison_target is not null then
    perform public.kill_player(p_game_id, v_poison_target, 'sorciere', v_night);
    update public.game_roles_secret set poison_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
  end if;

  select count(*) into v_deaths_after from public.game_players where game_id = p_game_id and died_at_night = v_night;

  if v_deaths_after = v_deaths_before and not v_infected then
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '☀️ Le village se réveille : personne n’est mort cette nuit !', v_night);
  end if;

  update public.games set night_deaths_resolved = true where id = p_game_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_my_game_view : restaure wolf_current_votes + pending_action_required
-- pour l'Alpha (voir le commentaire en tête de fichier, point 3) — sinon
-- inchangée par rapport à la version actuellement en base (0104).
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

    'wolf_teammates', case when v_my_role in ('loup_garou', 'loup_alpha') then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha') and rs.user_id <> v_user
    ), '[]'::jsonb) else null end,

    'wolf_alpha_id', case when v_my_role in ('loup_garou', 'loup_alpha') then (
      select rs.user_id from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'loup_alpha'
      limit 1
    ) else null end,

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

    -- Corrigé (point 3, tête de fichier) : couvre à nouveau 'loup_alpha'
    -- aussi, pas seulement 'loup_garou' — sinon l'Alpha ne voyait jamais le
    -- décompte des votes de la meute dans son propre panneau.
    'wolf_current_votes', case when v_my_role in ('loup_garou', 'loup_alpha') and v_game.status = 'night' and v_game.night_step = 'loup_garou' then coalesce((
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

    -- Corrigé (point 3, tête de fichier) : l'Alpha est de nouveau signalé
    -- comme ayant une action en attente pendant l'étape 'loup_garou', au
    -- même titre qu'un loup simple.
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
        and (v_my_role = v_game.night_step or (v_my_role = 'loup_alpha' and v_game.night_step = 'loup_garou'))
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

grant execute on function public.submit_loup_alpha_confirm_infect(uuid, boolean) to authenticated;
grant execute on function public.get_my_game_view(uuid) to authenticated;
