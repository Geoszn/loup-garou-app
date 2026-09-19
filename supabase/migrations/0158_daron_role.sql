-- ============================================================================
-- Nouveau rôle : le Daron 🛡️ (camp village).
--
-- Chaque nuit, choisit un joueur vivant à protéger (auto-protection
-- autorisée). Si ce joueur est visé par une attaque cette même nuit — celle
-- des Loups-Garous (mise à mort OU infection de l'Alpha) ou le poison de la
-- Sorcière — l'attaque échoue et il survit. Impossible de protéger la même
-- personne deux nuits de suite. Le Daron ne voit jamais les rôles : il peut
-- protéger un Loup-Garou sans le savoir (décision utilisateur explicite).
-- Gagne avec le village dès que tous les Loups sont éliminés — aucune
-- condition de victoire à part, contrairement à l'Ange ou Anancy.
--
-- Décisions prises avec l'utilisateur avant l'implémentation :
--  - La protection bloque aussi bien l'attaque des Loups QUE le poison de la
--    Sorcière (pas seulement l'attaque collective des loups).
--  - Le message de récap annonçant une protection réussie reste entièrement
--    anonyme (ne nomme ni le Daron, ni la personne protégée) — même
--    logique que le message existant pour la Sorcière qui sauve la victime
--    des loups, qui ne nomme jamais la victime non plus.
--  - Rôle disponible uniquement en configuration manuelle par l'hôte pour
--    l'instant, pas dans le mode de composition automatique
--    (compute_default_role_counts n'est donc pas touché par cette
--    migration).
--
-- ⚠️ Gotcha déjà rencontré lors de l'ajout du Griot (voir migration 0117,
-- corrective) : games.night_step a une contrainte CHECK listant
-- explicitement les valeurs autorisées — 'daron' doit y être ajouté ici,
-- sinon next_night_step plante dès qu'il tente de placer cette étape.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Contrainte CHECK sur games.night_step : ajoute 'daron'.
-- ----------------------------------------------------------------------------
alter table public.games drop constraint if exists games_night_step_check;
alter table public.games add constraint games_night_step_check
  check (night_step = any (array[
    'daron','voleur','cupidon','enfant_sauvage','voyante','griot',
    'loup_garou','grand_mechant_loup','sorciere','petite_fille','resolve','anancy'
  ]));

-- ----------------------------------------------------------------------------
-- 2. next_night_step : le Daron agit en tout premier, avant même la
-- Voyante — il protège "à l'aveugle", sans avoir besoin d'informations
-- d'aucun autre rôle, et sa protection doit être en place avant que les
-- autres actions de la nuit ne soient résolues. Agit dès la nuit 1 (aucune
-- restriction contrairement à Cupidon/Enfant Sauvage/Voleur). Ajouté aussi
-- à la liste des pouvoirs coupés par village_powers_disabled (déclenché
-- quand le village lynche l'Ancien à tort, voir migration 0153) : c'est un
-- pouvoir spécial du village comme la Voyante/la Sorcière/le Griot.
-- ----------------------------------------------------------------------------
create or replace function public.next_night_step(p_game_id uuid, p_night_number integer, p_current text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sequence text[];
  v_found_current boolean := (p_current is null);
  v_step text;
  v_powers_disabled boolean;
  v_wolf_death_occurred boolean;
begin
  select village_powers_disabled into v_powers_disabled from public.games where id = p_game_id;

  if p_night_number <= 1 then
    v_sequence := array['daron','voleur','cupidon','enfant_sauvage','voyante','loup_garou','grand_mechant_loup','sorciere','anancy'];
  else
    v_sequence := array['daron','voyante','griot','loup_garou','grand_mechant_loup','sorciere','anancy'];
  end if;

  foreach v_step in array v_sequence loop
    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;

    if v_step in ('voyante','sorciere','griot','daron') and coalesce(v_powers_disabled, false) then
      continue;
    end if;

    if v_step = 'sorciere' and not exists (
      select 1
      from public.game_roles_secret rs
      join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
      where rs.game_id = p_game_id and rs.role = 'sorciere' and gp.is_alive
        and (not coalesce(rs.heal_potion_used, false) or not coalesce(rs.poison_potion_used, false))
    ) then
      continue;
    end if;

    -- Le pouvoir de seconde victime du Grand Méchant Loup disparaît pour de
    -- bon dès qu'un loup (n'importe lequel, lui compris) est mort — vérifié
    -- ici plutôt que stocké, puisque l'état déjà présent (game_players +
    -- game_roles_secret) suffit à répondre à la question à tout moment.
    if v_step = 'grand_mechant_loup' then
      select exists (
        select 1
        from public.game_roles_secret rs
        join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
        where rs.game_id = p_game_id
          and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
          and not gp.is_alive
      ) into v_wolf_death_occurred;

      if v_wolf_death_occurred then
        continue;
      end if;
    end if;

    -- 'loup_garou' est le vote commun à TOUT le camp des Loups (voir
    -- submit_wolf_vote) — présent tant qu'AU MOINS UN des 4 rôles du camp
    -- est vivant, pas seulement le loup "de base" (voir commentaire
    -- d'en-tête de cette migration).
    if v_step = 'loup_garou' then
      if exists (
        select 1
        from public.game_roles_secret rs
        join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
        where rs.game_id = p_game_id
          and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
          and gp.is_alive
      ) then
        return 'loup_garou';
      end if;
      continue;
    end if;

    if public.role_alive_exists(p_game_id, v_step) then
      return v_step;
    end if;
  end loop;

  return null;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 3. submit_daron : soumet la cible protégée pour cette nuit. Impossible de
-- protéger la même personne que la nuit précédente — comparé directement
-- contre la ligne night_actions de la nuit d'avant (pas besoin d'une
-- colonne dédiée à maintenir). Auto-protection volontairement autorisée
-- (aucune vérification p_target <> v_user, contrairement à la Voyante/au
-- Griot).
-- ----------------------------------------------------------------------------
create or replace function public.submit_daron(p_game_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_last_protected uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'daron' then
    raise exception 'Ce n''est pas le moment pour le Daron.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'daron' then
    raise exception 'Vous n''êtes pas le Daron.';
  end if;
  if public._is_village_muted(p_game_id, v_user) then
    raise exception 'Le destin vous a rendu muet : vous ne pouvez pas agir cette nuit.';
  end if;
  if p_target is null or not exists (
    select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive
  ) then
    raise exception 'Joueur invalide.';
  end if;

  select target_id into v_last_protected
  from public.night_actions
  where game_id = p_game_id and night_number = v_game.night_number - 1 and step = 'daron' and actor_id = v_user
  limit 1;

  if v_last_protected is not null and v_last_protected = p_target then
    raise exception 'Vous ne pouvez pas protéger la même personne deux nuits de suite.';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'daron', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🛡️ Le Daron a fait son choix en secret.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_daron(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. resolve_night_deaths : la protection du Daron est vérifiée AVANT la
-- guérison de la Sorcière (si elle protège la même cible que la victime des
-- loups, l'attaque échoue déjà — pas besoin de consommer la potion de
-- guérison pour rien), puis à nouveau contre la cible du poison. Bloque
-- aussi bien une mise à mort classique qu'une infection de l'Alpha (les
-- deux passent par le même v_final_victim). La seconde victime garantie du
-- Grand Méchant Loup reste volontairement hors de portée de toute
-- protection, Daron compris — exactement comme pour la Sorcière déjà
-- (« frappe garantie »). poison_potion_used reste marqué "utilisé" même si
-- le Daron neutralise l'effet : la Sorcière a bien agi, seul le résultat
-- est neutralisé.
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
  v_gml_victim uuid;
  v_daron_target uuid;
  v_daron_saved boolean := false;
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
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'sans_visage', 'grand_mechant_loup') and gp.is_alive;

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

  select target_id into v_daron_target
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'daron'
  limit 1;

  select (extra->>'heal')::boolean, nullif(extra->>'poison_target','')::uuid
  into v_heal, v_poison_target
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'sorciere'
  limit 1;

  select count(*) into v_deaths_before from public.game_players where game_id = p_game_id and died_at_night = v_night;

  -- Protection du Daron contre l'attaque des Loups (mise à mort OU
  -- infection — les deux passent par v_final_victim).
  if v_daron_target is not null and v_daron_target = v_final_victim then
    v_daron_saved := true;
    v_final_victim := null;
  end if;

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

  -- Protection du Daron contre le poison de la Sorcière — indépendante de
  -- la protection contre les loups ci-dessus (une seule cible protégée par
  -- nuit peut couvrir l'une OU l'autre attaque, selon celle qui la vise).
  if v_poison_target is not null then
    if v_daron_target is not null and v_daron_target = v_poison_target then
      v_daron_saved := true;
    else
      perform public.kill_player(p_game_id, v_poison_target, 'sorciere', v_night);
    end if;
    update public.game_roles_secret set poison_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
  end if;

  -- Seconde victime du Grand Méchant Loup : frappe garantie, jamais soumise
  -- à la potion de guérison de la Sorcière ni à la protection du Daron —
  -- déjà résolue ci-dessus, sans le moindre effet sur cette cible.
  select target_id into v_gml_victim
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'grand_mechant_loup'
  limit 1;

  if v_gml_victim is not null then
    perform public.kill_player(p_game_id, v_gml_victim, 'loup_garou', v_night);
  end if;

  if v_daron_saved then
    insert into public.game_log (game_id, message, night_number, kind)
    values (p_game_id, '🛡️ La protection du Daron a permis à un joueur de survivre cette nuit.', v_night, 'daron_save');
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
-- 5. start_game : le Daron rejoint la liste des rôles assignables — un
-- simple booléen dans role_counts, exactement comme Griot/Anancy/Ange (pas
-- un rôle du camp des Loups, pas de contrainte de joueurs minimum comme
-- l'Alpha).
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
  v_last_roles text[];
  v_last_streaks int[];
  v_attempt int;
  v_ok boolean;
  v_has_alpha boolean;
  v_has_sans_visage boolean;
  v_has_gml boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l''hôte peut démarrer la partie.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  select array_agg(user_id order by seat_number) into v_players
  from public.game_players where game_id = p_game_id;

  v_count := coalesce(array_length(v_players, 1), 0);
  if v_count < 4 then raise exception 'Il faut au moins 4 joueurs pour commencer.'; end if;
  if v_count > 25 then raise exception 'Une partie ne peut pas dépasser 25 joueurs.'; end if;

  -- Mode auto (voir Lobby.tsx) : recalcule TOUJOURS selon l'effectif présent
  -- à cet instant précis, même si un role_counts manuel traîne encore en
  -- mémoire d'un réglage antérieur à l'activation du mode auto — c'est ce
  -- qui garantit que la composition annoncée par preview_auto_role_counts
  -- juste avant de cliquer "Lancer" est bien celle réellement distribuée.
  if coalesce((v_game.settings->>'auto_role_counts')::boolean, false) then
    v_role_counts := public.compute_default_role_counts(v_count);
  else
    v_role_counts := v_game.settings -> 'role_counts';
    if v_role_counts is null or v_role_counts = 'null'::jsonb then
      v_role_counts := public.compute_default_role_counts(v_count);
    end if;
  end if;

  v_has_alpha := coalesce((v_role_counts->>'loup_alpha')::boolean, false);
  v_has_sans_visage := coalesce((v_role_counts->>'sans_visage')::boolean, false);
  v_has_gml := coalesce((v_role_counts->>'grand_mechant_loup')::boolean, false);

  if v_has_alpha then
    if v_count < 10 then
      raise exception 'Le Loup Alpha nécessite au moins 10 joueurs.';
    end if;
  end if;

  v_special_total := (v_role_counts->>'loup_garou')::int
    + coalesce((v_role_counts->>'loup_alpha')::boolean::int, 0)
    + (v_role_counts->>'voyante')::boolean::int
    + (v_role_counts->>'sorciere')::boolean::int
    + (v_role_counts->>'chasseur')::boolean::int
    + (v_role_counts->>'petite_fille')::boolean::int
    + (v_role_counts->>'cupidon')::boolean::int
    + coalesce((v_role_counts->>'ancien')::boolean::int, 0)
    + coalesce((v_role_counts->>'voleur')::boolean::int, 0)
    + coalesce((v_role_counts->>'enfant_sauvage')::boolean::int, 0)
    + coalesce((v_role_counts->>'griot')::boolean::int, 0)
    + coalesce((v_role_counts->>'sans_visage')::boolean::int, 0)
    + coalesce((v_role_counts->>'anancy')::boolean::int, 0)
    + coalesce((v_role_counts->>'ange')::boolean::int, 0)
    + coalesce((v_role_counts->>'grand_mechant_loup')::boolean::int, 0)
    + coalesce((v_role_counts->>'daron')::boolean::int, 0);

  if (v_role_counts->>'loup_garou')::int < 1 and not v_has_alpha and not v_has_sans_visage and not v_has_gml then
    raise exception 'Il faut au moins un Loup-Garou.';
  end if;
  if v_special_total > v_count then
    raise exception 'La configuration des rôles dépasse le nombre de joueurs.';
  end if;

  for i in 1..(v_role_counts->>'loup_garou')::int loop
    v_roles := v_roles || 'loup_garou'::text;
  end loop;
  if v_has_alpha then v_roles := v_roles || 'loup_alpha'::text; end if;
  if v_has_sans_visage then v_roles := v_roles || 'sans_visage'::text; end if;
  if v_has_gml then v_roles := v_roles || 'grand_mechant_loup'::text; end if;
  if (v_role_counts->>'voyante')::boolean then v_roles := v_roles || 'voyante'::text; end if;
  if (v_role_counts->>'sorciere')::boolean then v_roles := v_roles || 'sorciere'::text; end if;
  if (v_role_counts->>'chasseur')::boolean then v_roles := v_roles || 'chasseur'::text; end if;
  if (v_role_counts->>'petite_fille')::boolean then v_roles := v_roles || 'petite_fille'::text; end if;
  if (v_role_counts->>'cupidon')::boolean then v_roles := v_roles || 'cupidon'::text; end if;
  if coalesce((v_role_counts->>'ancien')::boolean, false) then v_roles := v_roles || 'ancien'::text; end if;
  if coalesce((v_role_counts->>'enfant_sauvage')::boolean, false) then v_roles := v_roles || 'enfant_sauvage'::text; end if;
  if coalesce((v_role_counts->>'voleur')::boolean, false) then
    v_roles := v_roles || 'voleur'::text;
  end if;
  if coalesce((v_role_counts->>'griot')::boolean, false) then
    v_roles := v_roles || 'griot'::text;
  end if;
  if coalesce((v_role_counts->>'anancy')::boolean, false) then
    v_roles := v_roles || 'anancy'::text;
  end if;
  if coalesce((v_role_counts->>'ange')::boolean, false) then
    v_roles := v_roles || 'ange'::text;
  end if;
  if coalesce((v_role_counts->>'daron')::boolean, false) then
    v_roles := v_roles || 'daron'::text;
  end if;

  while coalesce(array_length(v_roles, 1), 0) < v_count loop
    v_roles := v_roles || 'villageois'::text;
  end loop;

  select array_agg(coalesce(p.last_role, '') order by t.ord), array_agg(coalesce(p.role_streak, 0) order by t.ord)
  into v_last_roles, v_last_streaks
  from unnest(v_players) with ordinality as t(user_id, ord)
  join public.profiles p on p.id = t.user_id;

  for v_attempt in 1..200 loop
    select array_agg(r order by random()) into v_shuffled from unnest(v_roles) r;

    v_ok := true;
    for i in 1..v_count loop
      if v_shuffled[i] = v_last_roles[i] and v_last_streaks[i] >= 2 then
        v_ok := false;
        exit;
      end if;
    end loop;

    exit when v_ok;
  end loop;

  for i in 1..v_count loop
    insert into public.game_roles_secret (game_id, user_id, role)
    values (p_game_id, v_players[i], v_shuffled[i]);

    update public.profiles
    set role_streak = case when last_role = v_shuffled[i] then role_streak + 1 else 1 end,
        last_role = v_shuffled[i]
    where id = v_players[i];
  end loop;

  select coalesce((v_game.settings->>'role_reveal_intro_seconds')::int, 60) into v_seconds;

  update public.game_players set is_ready = false where game_id = p_game_id;

  update public.games
  set status = 'role_reveal',
      night_number = 0,
      night_step = null,
      phase_deadline = now() + make_interval(secs => v_seconds),
      settings = jsonb_set(settings, '{role_counts}', v_role_counts),
      thief_extra_roles = null,
      village_powers_disabled = false,
      captain_pending = null
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🎭 Les rôles ont été distribués en secret. Regardez votre carte...');
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. compute_impact_bonus : bonus pour chaque protection réussie (même
-- valeur que le sauvetage de la Sorcière, +10) — compté sur les entrées
-- daron_save du journal, il n'y a jamais qu'un seul Daron par partie donc
-- toute entrée de ce type lui appartient forcément.
-- ----------------------------------------------------------------------------
create or replace function public.compute_impact_bonus(p_game_id uuid, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_bonus int := 0;
  v_details jsonb := '[]'::jsonb;
  v_heal_used boolean;
  v_poison_used boolean;
  v_poison_killed_wolf boolean;
  v_ancien_used boolean;
  v_hunter_killed_wolf boolean;
  v_seer_hits int;
  v_devoured int;
  v_total_rounds int;
  v_died_at int;
  v_survived int;
  v_alpha_infected boolean;
  v_gml_second_kill boolean;
  v_daron_saves int;
begin
  if p_role = 'sorciere' then
    select heal_potion_used, poison_potion_used into v_heal_used, v_poison_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if coalesce(v_heal_used, false) then
      v_bonus := v_bonus + 10;
      v_details := v_details || jsonb_build_object('kind', 'witch_heal', 'points', 10);
    end if;

    if coalesce(v_poison_used, false) then
      select exists (
        select 1 from public.game_players gp
        join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
        where gp.game_id = p_game_id and gp.death_cause = 'sorciere' and rs.role = 'loup_garou'
      ) into v_poison_killed_wolf;

      if v_poison_killed_wolf then
        v_bonus := v_bonus + 15;
        v_details := v_details || jsonb_build_object('kind', 'witch_poison_wolf', 'points', 15);
      end if;
    end if;
  end if;

  if p_role = 'daron' then
    select count(*) into v_daron_saves
    from public.game_log
    where game_id = p_game_id and kind = 'daron_save';

    if coalesce(v_daron_saves, 0) > 0 then
      v_bonus := v_bonus + v_daron_saves * 10;
      v_details := v_details || jsonb_build_object('kind', 'daron_save', 'points', v_daron_saves * 10, 'count', v_daron_saves);
    end if;
  end if;

  if p_role = 'chasseur' then
    select exists (
      select 1 from public.game_players gp
      join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
      where gp.game_id = p_game_id and gp.death_cause = 'chasseur' and rs.role = 'loup_garou'
    ) into v_hunter_killed_wolf;

    if v_hunter_killed_wolf then
      v_bonus := v_bonus + 15;
      v_details := v_details || jsonb_build_object('kind', 'hunter_shot_wolf', 'points', 15);
    end if;
  end if;

  if p_role = 'voyante' then
    select count(*) into v_seer_hits
    from public.night_actions na
    join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
    where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = p_user_id and rs.role = 'loup_garou';

    v_seer_hits := least(coalesce(v_seer_hits, 0), 2);
    if v_seer_hits > 0 then
      v_bonus := v_bonus + v_seer_hits * 5;
      v_details := v_details || jsonb_build_object('kind', 'seer_wolf_reveal', 'points', v_seer_hits * 5, 'count', v_seer_hits);
    end if;
  end if;

  if p_role = 'ancien' then
    select ancien_extra_life_used into v_ancien_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if coalesce(v_ancien_used, false) then
      v_bonus := v_bonus + 10;
      v_details := v_details || jsonb_build_object('kind', 'ancien_extra_life', 'points', 10);
    end if;
  end if;

  if p_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') then
    select count(*) into v_devoured
    from public.game_players where game_id = p_game_id and death_cause = 'loup_garou';

    if coalesce(v_devoured, 0) > 0 then
      v_bonus := v_bonus + v_devoured * 5;
      v_details := v_details || jsonb_build_object('kind', 'wolf_villagers_devoured', 'points', v_devoured * 5, 'count', v_devoured);
    end if;

    select greatest(night_number, 1) into v_total_rounds from public.games where id = p_game_id;
    select died_at_night into v_died_at from public.game_players where game_id = p_game_id and user_id = p_user_id;
    v_survived := coalesce(v_died_at, v_total_rounds);

    if v_survived > 0 then
      v_bonus := v_bonus + v_survived * 3;
      v_details := v_details || jsonb_build_object('kind', 'wolf_nights_survived', 'points', v_survived * 3, 'count', v_survived);
    end if;

    if p_role = 'loup_alpha' then
      select alpha_infect_used into v_alpha_infected
      from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

      if coalesce(v_alpha_infected, false) then
        v_bonus := v_bonus + 20;
        v_details := v_details || jsonb_build_object('kind', 'alpha_infected_villager', 'points', 20);
      end if;
    end if;

    if p_role = 'grand_mechant_loup' then
      select exists (
        select 1 from public.night_actions
        where game_id = p_game_id and step = 'grand_mechant_loup' and actor_id = p_user_id and target_id is not null
      ) into v_gml_second_kill;

      if coalesce(v_gml_second_kill, false) then
        v_bonus := v_bonus + 15;
        v_details := v_details || jsonb_build_object('kind', 'gml_second_kill', 'points', 15);
      end if;
    end if;
  end if;

  return jsonb_build_object('bonus', v_bonus, 'details', v_details);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. get_my_game_view : trois nouveaux champs, réservés au Daron lui-même.
-- daron_previous_target_id et daron_protected_id sont TOUJOURS calculés
-- pour lui dès qu'il a soumis son choix (comme seer_reveals/griot_reveals,
-- jamais restreints à 'day_reveal') : GameRoom.tsx en a besoin dès la nuit
-- elle-même (son panneau disparaît dès l'envoi, submit_daron avançant la
-- phase immédiatement comme submit_voyante/submit_griot), pas seulement au
-- récap. daron_protection_worked, lui, reste réservé à 'day_reveal' (même
-- patron que witch_saved_me/witch_poisoned_me) : la protection n'est
-- résolue qu'à la transition nuit → récap, l'afficher plus tôt dirait
-- toujours "non" à tort avant que la résolution n'ait eu lieu.
-- ----------------------------------------------------------------------------
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

  select (
    jsonb_build_object(
      'game', to_jsonb(v_game) - 'thief_extra_roles',

      'players', coalesce((
        select jsonb_agg(
          to_jsonb(gp) || jsonb_build_object(
            'rank_tier', public.rank_tier_for_points(coalesce(pr.rank_points, 0)),
            'has_masque_griot', exists (
              select 1 from public.player_artifacts pa
              join public.store_artifacts sa on sa.id = pa.artifact_id
              where pa.user_id = gp.user_id and sa.effect_key = 'masque_griot'
            ),
            'plume_title_fr', (
              select sa.name_fr from public.player_artifacts pa
              join public.store_artifacts sa on sa.id = pa.artifact_id
              where pa.user_id = gp.user_id and sa.effect_key = 'plume_anancy'
              limit 1
            ),
            'plume_title_en', (
              select sa.name_en from public.player_artifacts pa
              join public.store_artifacts sa on sa.id = pa.artifact_id
              where pa.user_id = gp.user_id and sa.effect_key = 'plume_anancy'
              limit 1
            )
          )
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

      'village_muted', public._is_village_muted(p_game_id, v_user),

      'daron_previous_target_id', case when v_my_role = 'daron' then (
        select target_id from public.night_actions
        where game_id = p_game_id and night_number = v_game.night_number - 1 and step = 'daron' and actor_id = v_user
        limit 1
      ) else null end,

      'daron_protected_id', case when v_my_role = 'daron' then (
        select target_id from public.night_actions
        where game_id = p_game_id and night_number = v_game.night_number and step = 'daron' and actor_id = v_user
        limit 1
      ) else null end,

      'daron_protection_worked', case when v_my_role = 'daron' and v_game.status = 'day_reveal' then exists (
        select 1 from public.game_log
        where game_id = p_game_id and night_number = v_game.night_number and kind = 'daron_save'
      ) else false end,

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
    || public.game_view_artifacts_fields(p_game_id, v_user)
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.get_my_game_view(uuid) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
