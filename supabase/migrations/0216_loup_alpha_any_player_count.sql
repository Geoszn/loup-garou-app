-- 0216 — Le Loup Alpha devient jouable à n'importe quel nombre de joueurs.
--
-- start_game refusait le Loup Alpha sous 10 joueurs ; le Sans-Visage et le
-- Grand Méchant Loup, eux, n'ont aucun minimum quand l'hôte les choisit à la
-- main. L'Alpha est aligné sur eux : seul le contrôle « moins de 10 joueurs »
-- est retiré (et son avertissement côté salon, voir Lobby.tsx).
--
-- Son mécanisme fonctionne déjà pour tout effectif : l'infection exige l'accord
-- de la majorité des loups vivants (loups vivants / 2 + 1 — un loup seul suffit,
-- à deux il faut l'accord des deux), et « il faut au moins un loup » compte déjà
-- l'Alpha. Reprise à l'identique de la version de 0171 pour tout le reste ; la
-- composition automatique (compute_default_role_counts) ne change pas : elle
-- ne tire une variante de meute qu'à partir de 10 joueurs, pour les trois.
set search_path = public;

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
  v_disabled_roles text[];
  v_bad_role text;
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

  select coalesce(array_agg(role), array[]::text[]) into v_disabled_roles
  from public.role_config where not is_enabled;

  foreach v_bad_role in array v_disabled_roles loop
    if coalesce((v_role_counts->>v_bad_role)::boolean, false) then
      raise exception 'Le rôle % a été désactivé par un administrateur.', v_bad_role;
    end if;
  end loop;

  v_has_alpha := coalesce((v_role_counts->>'loup_alpha')::boolean, false);
  v_has_sans_visage := coalesce((v_role_counts->>'sans_visage')::boolean, false);
  v_has_gml := coalesce((v_role_counts->>'grand_mechant_loup')::boolean, false);

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
    + coalesce((v_role_counts->>'daron')::boolean::int, 0)
    + coalesce((v_role_counts->>'chasseuse')::boolean::int, 0);

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
  if coalesce((v_role_counts->>'chasseuse')::boolean, false) then
    v_roles := v_roles || 'chasseuse'::text;
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
