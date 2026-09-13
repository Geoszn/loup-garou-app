-- ============================================================================
-- Découpe get_my_game_view (jusqu'ici un unique bloc PL/pgSQL d'environ 370
-- lignes, réécrit intégralement dans 39 migrations précédentes) en une
-- orchestration courte + une fonction par domaine de rôle/mécanique
-- (game_view_witch_fields, game_view_wolf_pack_fields, etc.).
--
-- Aucun changement de comportement ni de forme du JSON retourné : chaque
-- expression est reprise mot pour mot de la version actuelle (voir
-- 0137_anancy_swap_notice_persists.sql), seul le découpage change. Le
-- frontend (src/hooks/useGame.ts, types/game.ts) n'a besoin d'aucune
-- modification.
--
-- Pourquoi : ce fichier a été la source d'au moins 3 régressions en
-- production —
--   - 0044 et 0102 : des champs entiers perdus parce qu'une migration
--     repartait d'une copie du corps de la fonction plus ancienne que la
--     dernière version réelle (le fichier est trop long pour qu'une revue
--     humaine tienne les ~46 champs en tête à chaque changement) ;
--   - 0096 : une coquille (p_user_id au lieu de v_user) dans UNE SEULE
--     branche CASE a cassé la fonction pour TOUS les joueurs — parce que
--     c'est un unique SELECT scalaire, Postgres résout tous les
--     identifiants du texte de la requête à la planification, peu importe
--     la branche réellement empruntée à l'exécution.
--
-- Avec ce découpage, une migration qui ne touche qu'un domaine (ex. Anancy)
-- n'a plus qu'à réécrire la petite fonction correspondante (~15 lignes),
-- jamais les 46 champs à la fois — et une coquille dans un domaine ne peut
-- plus faire tomber un autre domaine dans le même appel (chaque fonction a
-- son propre plan de requête).
--
-- Chaque fonction ci-dessous suit exactement le même patron que
-- get_wolf_target / compute_griot_phrase / compute_impact_bonus /
-- role_alive_exists, déjà présentes dans le projet : SECURITY DEFINER,
-- jamais grantée à `authenticated` (voir migration 0045 — le rôle qui
-- exécute get_my_game_view en tant que SECURITY DEFINER en est aussi le
-- propriétaire, donc implicitement autorisé à les appeler sans grant
-- explicite). Le grant existant sur get_my_game_view(uuid) lui-même est
-- conservé tel quel par ce `create or replace` (même signature — voir
-- scripts/check-rpc-grants.mjs).
--
-- Garde-fou ajouté en parallèle de cette migration : scripts/check-game-
-- view-fields.mjs, qui compare statiquement (sans base de données) les
-- champs réellement retournés par get_my_game_view à l'interface
-- TypeScript MyGameView — c'est le filet qui aurait attrapé 0044/0102 avant
-- un déploiement.
-- ============================================================================
set search_path = public;

-- --- Sorcière : ses propres potions + les notices personnelles des cibles ---
create or replace function public.game_view_witch_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'witch_saved_me', case when p_game.status = 'day_reveal' then exists (
      select 1 from public.game_log
      where game_id = p_game_id and night_number = p_game.night_number and kind = 'witch_heal'
        and (meta->>'target_user_id')::uuid = p_user
    ) else false end,

    'witch_poisoned_me', case when p_game.status = 'day_reveal' then exists (
      select 1 from public.game_players
      where game_id = p_game_id and user_id = p_user
        and death_cause = 'sorciere' and died_at_night = p_game.night_number
    ) else false end,

    'witch_heal_used', case when p_my_role = 'sorciere' then (
      select heal_potion_used from public.game_roles_secret where game_id = p_game_id and user_id = p_user
    ) else null end,

    'witch_poison_used', case when p_my_role = 'sorciere' then (
      select poison_potion_used from public.game_roles_secret where game_id = p_game_id and user_id = p_user
    ) else null end,

    'wolf_target_visible_to_witch', case
      when p_my_role = 'sorciere' and p_game.status = 'night' and p_game.night_step = 'sorciere'
      then public.get_wolf_target(p_game_id, p_game.night_number)
      else null
    end
  );
$$;

-- --- Meute de loups (loup_garou/loup_alpha/sans_visage/grand_mechant_loup) --
create or replace function public.game_view_wolf_pack_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'alpha_infected_me', case when p_game.status = 'day_reveal' then exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = p_user and infected_at_night = p_game.night_number
    ) else false end,

    'alpha_infection_occurred', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and role = 'loup_alpha' and alpha_infect_used = true
    ),

    'alpha_infect_used', case when p_my_role = 'loup_alpha' then (
      select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and user_id = p_user
    ) else null end,

    'alpha_infect_available', p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
      and p_game.status = 'night' and p_game.night_step = 'loup_garou'
      and public.role_alive_exists(p_game_id, 'loup_alpha')
      and not coalesce((
        select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha'
      ), false),

    'alpha_infect_agreed_ids', case
      when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and p_game.status = 'night' and p_game.night_step = 'loup_garou'
      then coalesce((
        select jsonb_agg(user_id) from public.alpha_infect_agreements
        where game_id = p_game_id and night_number = p_game.night_number
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,

    'alpha_infect_confirmed', case
      when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and p_game.status = 'night' and p_game.night_step = 'loup_garou'
      then exists (
        select 1 from public.night_actions
        where game_id = p_game_id and night_number = p_game.night_number and step = 'loup_alpha_confirm'
          and (extra->>'confirmed')::boolean is true
      )
      else false
    end,

    'wolf_teammates', case when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and rs.user_id <> p_user
    ), '[]'::jsonb) else null end,

    'wolf_alpha_id', case when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') then (
      select rs.user_id from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'loup_alpha'
      limit 1
    ) else null end,

    'wolf_current_votes', case when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and p_game.status = 'night' and p_game.night_step = 'loup_garou' then coalesce((
      select jsonb_agg(jsonb_build_object('actor_id', actor_id, 'target_id', target_id))
      from public.night_actions
      where game_id = p_game_id and night_number = p_game.night_number and step = 'loup_garou'
    ), '[]'::jsonb) else null end,

    'wolf_night_recap', case
      when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and p_game.status = 'day_reveal' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'actor_id', na.actor_id,
          'actor_name', gp.display_name,
          'is_alpha', rs.role = 'loup_alpha',
          'target_id', na.target_id,
          'target_name', tgp.display_name,
          'chose_infect', exists (
            select 1 from public.alpha_infect_agreements aia
            where aia.game_id = p_game_id and aia.night_number = p_game.night_number and aia.user_id = na.actor_id
          )
        ) order by (rs.role = 'loup_alpha') desc, gp.display_name)
        from public.night_actions na
        join public.game_players gp on gp.game_id = na.game_id and gp.user_id = na.actor_id
        join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.actor_id
        left join public.game_players tgp on tgp.game_id = na.game_id and tgp.user_id = na.target_id
        where na.game_id = p_game_id and na.night_number = p_game.night_number and na.step = 'loup_garou'
      ), '[]'::jsonb)
      else null
    end
  );
$$;

-- --- Voleur : notices privées, actrice comme victime -----------------------
create or replace function public.game_view_thief_fields(p_game_id uuid, p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'thief_stole_my_card', exists (
      select 1 from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = p_user
    ),
    'thief_stole_my_new_role', (
      select meta->>'new_role' from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = p_user
      order by created_at desc limit 1
    ),
    'thief_i_stole', exists (
      select 1 from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'actor_id')::uuid = p_user
    ),
    'thief_my_new_role', (
      select meta->>'actor_new_role' from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'actor_id')::uuid = p_user
      order by created_at desc limit 1
    )
  );
$$;

-- --- Enfant Sauvage ----------------------------------------------------------
create or replace function public.game_view_wild_child_fields(
  p_game_id uuid, p_game public.games, p_user uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'chosen_as_mentor', exists (
      select 1 from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'enfant_sauvage' and rs.wild_child_mentor = p_user
    ),

    'wild_child_turned_wolf', case when p_game.status = 'day_reveal' then exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = p_user and wild_child_turned_at_night = p_game.night_number
    ) else false end,

    'wild_child_conversion_occurred', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night is not null
    ),

    'wild_child_conversion_this_round', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night = p_game.night_number
    )
  );
$$;

-- --- Voyante / Griot ---------------------------------------------------------
create or replace function public.game_view_seer_griot_fields(
  p_game_id uuid, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'seer_reveals', case when p_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', case when rs.role in ('loup_garou', 'loup_alpha', 'grand_mechant_loup') then 'loup_garou' else 'villageois' end,
        'night_number', na.night_number
      ) order by na.night_number)
      from public.night_actions na
      join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
      where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = p_user
    ), '[]'::jsonb) else null end,

    'griot_reveals', case when p_my_role = 'griot' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'night_number', na.night_number,
        'kind', public.compute_griot_phrase(p_game_id, na.target_id, na.night_number - 1)
      ) order by na.night_number)
      from public.night_actions na
      where na.game_id = p_game_id and na.step = 'griot' and na.actor_id = p_user
    ), '[]'::jsonb) else null end
  );
$$;

-- --- Anancy --------------------------------------------------------------
create or replace function public.game_view_anancy_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'anancy_swapped_me', exists (
      select 1 from public.anancy_swapped_players
      where game_id = p_game_id and user_id = p_user and swapped_at_night = p_game.night_number
    ),

    'anancy_used_target_ids', case when p_my_role = 'anancy' then coalesce((
      select jsonb_agg(user_id) from public.anancy_swapped_players where game_id = p_game_id
    ), '[]'::jsonb) else null end
  );
$$;

-- --- Votes (capitaine, village) + succession/chasseur/récaps ----------------
create or replace function public.game_view_vote_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text, p_my_alive boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = p_game.night_number and voter_id = p_user
    ),

    'my_captain_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = 0 and voter_id = p_user
    ),

    'vote_call_agreed_ids', case when p_game.status = 'day_discussion' then coalesce((
      select jsonb_agg(user_id) from public.vote_call_agreements
      where game_id = p_game_id and day_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'day_reveal_ready_ids', case when p_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(user_id) from public.day_reveal_ready
      where game_id = p_game_id and round_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'night_recap', case when p_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message) order by created_at asc)
      from public.game_log
      where game_id = p_game_id and night_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'vote_recap', case when p_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = p_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = p_game.night_number
      ), '[]'::jsonb),
      'captain_voter_id', p_game.last_vote_captain_id,
      'captain_random_notice', (
        select message from public.game_log
        where game_id = p_game_id and night_number = p_game.night_number and kind = 'captain_random'
        order by created_at desc limit 1
      )
    ) else null end,

    'pending_action_required', case
      when p_game.hunter_pending = p_user then 'hunter'
      when p_game.captain_pending = p_user then 'captain_succession'
      when p_game.status = 'captain_election' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = 0 and voter_id = p_user
        )
      then 'captain_vote'
      when p_game.status = 'night' and p_my_alive
        and (p_my_role = p_game.night_step or (p_my_role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and p_game.night_step = 'loup_garou'))
        and not exists (
          select 1 from public.night_actions
          where game_id = p_game_id and night_number = p_game.night_number
            and step = p_game.night_step and actor_id = p_user
        )
      then p_game.night_step
      when p_game.status = 'day_vote' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = p_game.night_number and voter_id = p_user
        )
      then 'vote'
      else null
    end,

    'final_reveal', case when p_game.status = 'ended' then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', rs.user_id, 'role', rs.role))
      from public.game_roles_secret rs where rs.game_id = p_game_id
    ), '[]'::jsonb) else null end
  );
$$;

-- --- Salon d'attente : demandes pour rejoindre, réservé à l'hôte -----------
create or replace function public.game_view_lobby_fields(
  p_game_id uuid, p_game public.games, p_user uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'join_requests', case
      when p_game.host_id = p_user and p_game.status = 'lobby' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'user_id', user_id, 'display_name', display_name, 'created_at', created_at
        ) order by created_at asc)
        from public.game_join_requests
        where game_id = p_game_id and status = 'pending'
      ), '[]'::jsonb)
      else null
    end
  );
$$;

-- --- Progression (bonus d'impact, résultat final de partie) ----------------
create or replace function public.game_view_progression_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text, p_my_alive boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_impact_preview', case
      when not coalesce(p_my_alive, false) and p_game.status <> 'ended' and p_my_role is not null
      then public.compute_impact_bonus(p_game_id, p_user, p_my_role)
      else null
    end,

    'my_game_result', case when p_game.status = 'ended' then (
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
      where gr.game_id = p_game_id and gr.user_id = p_user
      order by gr.created_at desc limit 1
    ) else null end
  );
$$;

-- --- Orchestrateur : ce qui reste trivial/transverse + fusion des domaines --
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

  select (
    jsonb_build_object(
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

      'log', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'message', message, 'created_at', created_at) order by created_at desc)
        from (
          select id, message, created_at from public.game_log
          where game_id = p_game_id order by created_at desc limit 60
        ) recent
      ), '[]'::jsonb)
    )
    || public.game_view_witch_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_wolf_pack_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_thief_fields(p_game_id, v_user)
    || public.game_view_wild_child_fields(p_game_id, v_game, v_user)
    || public.game_view_seer_griot_fields(p_game_id, v_user, v_my_role)
    || public.game_view_anancy_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_vote_fields(p_game_id, v_game, v_user, v_my_role, v_my_alive)
    || public.game_view_lobby_fields(p_game_id, v_game, v_user)
    || public.game_view_progression_fields(p_game_id, v_game, v_user, v_my_role, v_my_alive)
  ) into v_result;

  return v_result;
end;
$function$;
