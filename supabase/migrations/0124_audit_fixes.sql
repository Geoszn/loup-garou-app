-- ----------------------------------------------------------------------------
-- BUG CORRIGÉ (audit système, aucun retour utilisateur spécifique) :
-- admin_get_game_detail calculait quels joueurs sont "en attente d'agir"
-- (indicateur du dashboard admin) en ne reconnaissant QUE le Loup Alpha
-- comme exception au night_step partagé 'loup_garou' — le Sans-Visage
-- (migration 0118) et le Grand Méchant Loup (migration 0121) votent
-- pourtant avec le reste de la meute exactement de la même façon, sous ce
-- même night_step, mais sous un nom de rôle différent. Un Sans-Visage ou un
-- Grand Méchant Loup vivant qui n'avait pas encore voté n'apparaissait donc
-- jamais comme "en attente" dans le dashboard admin — potentiellement
-- trompeur pour diagnostiquer une partie bloquée. Même correctif déjà
-- appliqué à get_my_game_view (pending_action_required) : cette fonction
-- avait été oubliée à chaque fois car elle ne mentionnait jamais
-- 'sans_visage' comme point d'ancrage de recherche.
-- ----------------------------------------------------------------------------

create or replace function public.admin_get_game_detail(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin uuid := auth.uid();
  v_game public.games%rowtype;
  v_pending_ids uuid[];
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Partie introuvable.';
  end if;

  v_pending_ids := case
    when v_game.status = 'night' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
      where gp.game_id = p_game_id and gp.is_alive
        and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.night_step = 'loup_garou'))
        and not exists (
          select 1 from public.night_actions na
          where na.game_id = p_game_id and na.night_number = v_game.night_number
            and na.step = v_game.night_step and na.actor_id = gp.user_id
        )
    ), array[]::uuid[])
    when v_game.status = 'day_vote' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      where gp.game_id = p_game_id and gp.is_alive
        and not exists (
          select 1 from public.votes v
          where v.game_id = p_game_id and v.round_number = v_game.night_number and v.voter_id = gp.user_id
        )
    ), array[]::uuid[])
    when v_game.status = 'captain_election' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      where gp.game_id = p_game_id and gp.is_alive
        and not exists (
          select 1 from public.votes v
          where v.game_id = p_game_id and v.round_number = 0 and v.voter_id = gp.user_id
        )
    ), array[]::uuid[])
    when v_game.status = 'day_reveal' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      where gp.game_id = p_game_id and gp.is_alive
        and not exists (
          select 1 from public.day_reveal_ready r
          where r.game_id = p_game_id and r.round_number = v_game.night_number and r.user_id = gp.user_id
        )
    ), array[]::uuid[])
    when v_game.status = 'day_vote_recap' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      where gp.game_id = p_game_id and gp.is_alive
        and not exists (
          select 1 from public.vote_recap_ready r
          where r.game_id = p_game_id and r.round_number = v_game.night_number and r.user_id = gp.user_id
        )
    ), array[]::uuid[])
    else array[]::uuid[]
  end;

  return jsonb_build_object(
    'game', jsonb_build_object(
      'id', v_game.id,
      'code', v_game.code,
      'status', v_game.status,
      'is_public', v_game.is_public,
      'night_number', v_game.night_number,
      'night_step', v_game.night_step,
      'phase_deadline', v_game.phase_deadline,
      'created_at', v_game.created_at,
      'last_activity_at', v_game.last_activity_at,
      'hunter_pending', v_game.hunter_pending,
      'captain_pending', v_game.captain_pending
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', gp.user_id,
        'display_name', gp.display_name,
        'is_alive', gp.is_alive,
        'is_host', gp.is_host,
        'is_captain', gp.is_captain,
        'seat_number', gp.seat_number,
        'pending', gp.user_id = any(v_pending_ids)
      ) order by gp.seat_number)
      from public.game_players gp
      where gp.game_id = p_game_id
    ), '[]'::jsonb)
  );
end;
$function$;

-- ----------------------------------------------------------------------------
-- BUG CORRIGÉ (audit système, aucun retour utilisateur spécifique) :
-- compute_griot_phrase déterminait l'action d'un joueur une nuit donnée en
-- regardant son rôle ACTUEL (au moment où le Griot consulte la révélation),
-- pas son rôle CE SOIR-LÀ. Sans Anancy, les rôles ne changeaient jamais en
-- cours de partie, donc ça ne posait aucun problème — mais depuis
-- l'introduction d'Anancy (migration 0119), un joueur peut légitimement
-- avoir agi en tant que Voyante/Sorcière/Loup/etc. une nuit, puis se voir
-- échanger vers un autre rôle une nuit suivante. La prochaine fois que le
-- Griot consultait (ou qu'un client recalculait) sa révélation sur cette
-- nuit-là, la fonction regardait le NOUVEAU rôle, ne le reconnaissait plus,
-- et retombait à tort sur "aucune action particulière" — une information
-- silencieusement fausse pour le Griot.
--
-- Correctif : pour tous les rôles qui SOUMETTENT une action de nuit (donc
-- une ligne dans night_actions), l'existence de cette ligne pour l'étape
-- concernée suffit à elle seule à identifier l'action — chaque fonction
-- submit_xxx vérifie déjà le rôle de l'appelant AU MOMENT DE L'ACTION avant
-- d'insérer sa ligne (submit_voyante, submit_wolf_vote, submit_sorciere,
-- submit_cupidon, submit_voleur, submit_enfant_sauvage,
-- submit_grand_mechant_loup) : cette ligne reste donc une preuve fiable et
-- immuable de "ce joueur avait ce rôle cette nuit-là", indépendante de tout
-- échange survenu depuis. Seule exception restante : la Petite Fille, qui
-- ne soumet jamais d'action de nuit (rien à observer dans night_actions) —
-- son cas reste basé sur le rôle actuel, limite connue et acceptée (bien
-- plus rare : il faudrait qu'Anancy l'échange APRÈS la nuit concernée mais
-- AVANT que le Griot ne consulte sa révélation).
-- ----------------------------------------------------------------------------

create or replace function public.compute_griot_phrase(p_game_id uuid, p_target_id uuid, p_night_number integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_night_number < 1 then
    return 'no_action';
  end if;

  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target_id;
  if v_role is null then
    return 'no_action';
  end if;

  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'voyante' and actor_id = p_target_id
  ) then
    return 'observed_card';
  end if;

  -- Petite Fille : aucune action soumise, seul son rôle ACTUEL en témoigne
  -- (voir le commentaire d'en-tête de cette migration).
  if v_role = 'petite_fille' then
    return 'watched_wolves';
  end if;

  -- Seconde victime du Grand Méchant Loup : vérifiée avant le vote de
  -- meute partagé ci-dessous, pour rester cohérente avec l'ordre déjà en
  -- place côté migration 0121 (son pouvoir personnel prime sur le simple
  -- vote collectif dans la phrase révélée).
  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'grand_mechant_loup' and actor_id = p_target_id
      and target_id is not null
  ) then
    return 'used_power';
  end if;

  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'loup_garou' and actor_id = p_target_id
  ) then
    return 'wolf_vote';
  end if;

  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'sorciere' and actor_id = p_target_id
      and ((extra->>'heal')::boolean is true or nullif(extra->>'poison_target', '') is not null)
  ) then
    return 'used_power';
  end if;

  if p_night_number = 1 and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'cupidon' and actor_id = p_target_id
  ) then
    return 'linked_lovers';
  end if;

  if p_night_number = 1 and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'voleur' and actor_id = p_target_id
  ) then
    return 'swapped_role';
  end if;

  if p_night_number = 1 and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'enfant_sauvage' and actor_id = p_target_id
  ) then
    return 'chose_mentor';
  end if;

  return 'no_action';
end;
$$;
