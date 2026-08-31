-- ----------------------------------------------------------------------------
-- BUG CORRIGÉ (retour utilisateur, capture d'écran) : l'échange de rôles
-- d'Anancy s'appliquait IMMÉDIATEMENT lors de sa soumission, la même nuit —
-- alors que le choix de conception explicite était "décalé, effectif
-- seulement le lendemain". Comme Anancy joue toujours en dernier, ça ne se
-- voyait presque jamais... sauf pour resolve_night_deaths, qui tourne juste
-- après son tour, LA MÊME NUIT, et qui lit donc le rôle déjà échangé au
-- moment de tuer/révéler la victime des loups. Résultat observé : la meute
-- vote validement pour un non-loup (ex. la Voyante), Anancy l'échange
-- ensuite avec un loup cette même nuit, et le journal affiche à tort
-- "X (Loup Alpha) a été dévoré par les Loups-Garous" — alors que le vote de
-- la meute était parfaitement légitime au moment où il a été soumis.
--
-- Correctif : submit_anancy n'applique plus le swap sur game_roles_secret —
-- il se contente d'enregistrer l'action (déjà fait) et de marquer les deux
-- joueurs comme "touchés" avec swapped_at_night = nuit SUIVANTE (celle où
-- l'échange prendra réellement effet, pour que la notice privée "Le destin
-- a changé" apparaisse au bon moment). begin_night applique maintenant
-- l'échange en tout début de la nuit qui suit celle où Anancy a agi, avant
-- que quoi que ce soit d'autre ne se passe cette nuit-là — jamais avant.
-- ----------------------------------------------------------------------------

create or replace function public.begin_night(p_game_id uuid, p_night_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_step text;
  v_seconds int;
  v_pending_target1 uuid;
  v_pending_target2 uuid;
  v_role1 text;
  v_role2 text;
begin
  -- Applique l'échange de rôles d'Anancy DE LA NUIT PRÉCÉDENTE, maintenant
  -- seulement — voir le commentaire d'en-tête de cette migration.
  select target_id, nullif(extra->>'target2', '')::uuid
  into v_pending_target1, v_pending_target2
  from public.night_actions
  where game_id = p_game_id and night_number = p_night_number - 1 and step = 'anancy' and target_id is not null
  limit 1;

  if v_pending_target1 is not null and v_pending_target2 is not null then
    select role into v_role1 from public.game_roles_secret where game_id = p_game_id and user_id = v_pending_target1;
    select role into v_role2 from public.game_roles_secret where game_id = p_game_id and user_id = v_pending_target2;

    update public.game_roles_secret set role = v_role2 where game_id = p_game_id and user_id = v_pending_target1;
    update public.game_roles_secret set role = v_role1 where game_id = p_game_id and user_id = v_pending_target2;
  end if;

  delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

  v_first_step := public.next_night_step(p_game_id, p_night_number, null);
  v_seconds := public.step_duration_seconds(p_game_id, coalesce(v_first_step, 'resolve'));

  update public.games
  set status = 'night',
      night_number = p_night_number,
      night_step = coalesce(v_first_step, 'resolve'),
      phase_deadline = now() + make_interval(secs => v_seconds),
      night_deaths_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🌙 La nuit ' || p_night_number || ' tombe sur le village. Tout le monde ferme les yeux...');
end;
$$;

create or replace function public.submit_anancy(p_game_id uuid, p_target1 uuid, p_target2 uuid)
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
  if not found or v_game.status <> 'night' or v_game.night_step <> 'anancy' then
    raise exception 'Ce n''est pas le moment pour Anancy.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'anancy' then
    raise exception 'Vous n''êtes pas Anancy.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  if (p_target1 is null) <> (p_target2 is null) then
    raise exception 'Choisissez deux joueurs, ou aucun.';
  end if;

  if p_target1 is not null then
    if p_target1 = p_target2 then
      raise exception 'Choisissez deux joueurs différents.';
    end if;
    if p_target1 = v_user or p_target2 = v_user then
      raise exception 'Vous ne pouvez pas vous choisir vous-même.';
    end if;
    if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target1 and is_alive)
      or not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target2 and is_alive) then
      raise exception 'Joueur invalide.';
    end if;
    if exists (
      select 1 from public.anancy_swapped_players
      where game_id = p_game_id and user_id in (p_target1, p_target2)
    ) then
      raise exception 'Un de ces joueurs a déjà été touché par le destin — impossible de le cibler à nouveau.';
    end if;

    -- L'échange lui-même n'est PLUS appliqué ici : voir begin_night, qui
    -- l'applique au tout début de la nuit SUIVANTE. swapped_at_night pointe
    -- déjà vers cette nuit suivante, pour que la notice privée "Le destin a
    -- changé" (anancy_swapped_me, get_my_game_view) n'apparaisse que
    -- lorsque l'échange a réellement eu lieu, jamais un jour trop tôt.
    insert into public.anancy_swapped_players (game_id, user_id, swapped_at_night)
    values (p_game_id, p_target1, v_game.night_number + 1), (p_game_id, p_target2, v_game.night_number + 1);
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
  values (p_game_id, v_game.night_number, 'anancy', v_user, p_target1, jsonb_build_object('target2', p_target2))
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id, extra = excluded.extra;

  perform public.advance_phase(p_game_id, true);
end;
$$;
