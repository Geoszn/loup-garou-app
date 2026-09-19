-- ============================================================================
-- Activer/désactiver des rôles depuis le dashboard admin (retour
-- utilisateur) : un bouton par carte, dans "Contenu du jeu" → "Cartes des
-- rôles". Un rôle désactivé ne doit plus jamais apparaître dans une partie —
-- ni proposable manuellement par l'hôte, ni tiré au hasard par le mode
-- automatique.
--
-- Nouvelle table role_config : une ligne par rôle "optionnel", c'est-à-dire
-- les 15 rôles qui ont déjà une case à cocher dans Lobby.tsx (DEFAULT_COUNTS)
-- — ni Loup-Garou (nombre de base, jamais 0) ni Villageois (rôle implicite de
-- remplissage), qui sont structurellement obligatoires et n'ont pas de case.
-- Capitaine non plus : c'est un statut, pas une carte de rôle (ROLES/
-- ROLE_ORDER dans lib/roles.ts ne le liste même pas). is_enabled = true par
-- défaut pour tous, ce qui préserve exactement le comportement actuel tant
-- qu'aucun admin n'a rien désactivé.
--
-- Lecture publique (même patron que content_overrides, voir migration
-- 0053) : la liste des rôles désactivés n'a rien de sensible et doit être
-- connue de tout client pour filtrer sa propre liste de cases à cocher
-- (Lobby.tsx). Écriture réservée aux admins (admin_set_role_enabled).
-- ============================================================================
create table if not exists public.role_config (
  role text primary key check (role in (
    'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'voyante', 'sorciere',
    'chasseur', 'petite_fille', 'cupidon', 'ancien', 'voleur', 'enfant_sauvage',
    'griot', 'anancy', 'ange', 'daron'
  )),
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.role_config enable row level security;
-- Aucune policy client : lecture via get_disabled_roles (public), écriture
-- via admin_set_role_enabled (admin) — même patron que content_overrides.

insert into public.role_config (role) values
  ('loup_alpha'), ('sans_visage'), ('grand_mechant_loup'), ('voyante'), ('sorciere'),
  ('chasseur'), ('petite_fille'), ('cupidon'), ('ancien'), ('voleur'), ('enfant_sauvage'),
  ('griot'), ('anancy'), ('ange'), ('daron')
on conflict (role) do nothing;

-- ----------------------------------------------------------------------------
-- get_disabled_roles : lecture PUBLIQUE (anon + authenticated), comme
-- get_content_overrides — simple liste des ids de rôles actuellement
-- désactivés, consommée par Lobby.tsx pour masquer les cases correspondantes.
-- ----------------------------------------------------------------------------
create or replace function public.get_disabled_roles()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(role), array[]::text[]) from public.role_config where not is_enabled;
$$;

grant execute on function public.get_disabled_roles() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- admin_set_role_enabled : bascule un seul rôle, même patron que
-- admin_set_content_override (0053) — vérifie is_admin_user, journalise dans
-- admin_audit_log.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_role_enabled(p_role text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  update public.role_config
  set is_enabled = p_enabled, updated_at = now(), updated_by = v_admin
  where role = p_role;

  if not found then
    raise exception 'Rôle inconnu : %', p_role;
  end if;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'set_role_enabled', p_role, jsonb_build_object('enabled', p_enabled));
end;
$$;

grant execute on function public.admin_set_role_enabled(text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- compute_default_role_counts (mode automatique) : chaque rôle désactivé ne
-- peut plus être tiré au hasard, y compris comme variante de meute. Reste
-- identique à la version précédente (0145) sinon — même seuils, mêmes
-- probabilités, même boucle de garde-fou.
-- ----------------------------------------------------------------------------
create or replace function public.compute_default_role_counts(p_player_count integer)
returns jsonb
language plpgsql
as $$
declare
  v_disabled text[];
  v_wolves int;
  -- null | 'loup_alpha' | 'sans_visage' | 'grand_mechant_loup'
  v_wolf_variant text;
  v_wolf_variant_choices text[];
  v_voyante boolean;
  v_sorciere boolean;
  v_petite_fille boolean;
  v_ancien boolean;
  v_voleur boolean;
  v_enfant_sauvage boolean;
  v_chasseur boolean;
  v_cupidon boolean;
  v_griot boolean;
  v_anancy boolean;
  v_ange boolean;
  v_special_total int;
begin
  select coalesce(array_agg(role), array[]::text[]) into v_disabled
  from public.role_config where not is_enabled;

  v_wolves := greatest(1, round(p_player_count * 0.25));
  if v_wolves >= p_player_count then
    v_wolves := greatest(1, p_player_count / 2);
  end if;

  -- Variante de meute : même seuil que celui déjà imposé au Loup Alpha
  -- ailleurs dans le moteur (start_game exige ≥10 joueurs pour lui) —
  -- appliqué identiquement aux trois variantes. Une seule à la fois, et
  -- uniquement parmi celles non désactivées.
  v_wolf_variant := null;
  if p_player_count >= 10 and random() < 0.35 then
    select array_agg(v) into v_wolf_variant_choices
    from unnest(array['loup_alpha', 'sans_visage', 'grand_mechant_loup']) v
    where not (v = any(v_disabled));

    if coalesce(array_length(v_wolf_variant_choices, 1), 0) > 0 then
      v_wolf_variant := v_wolf_variant_choices[1 + floor(random() * array_length(v_wolf_variant_choices, 1))::int];
      v_wolves := greatest(v_wolves - 1, 1);
    end if;
  end if;

  v_voyante := p_player_count >= 5 and random() < 0.9 and not ('voyante' = any(v_disabled));
  v_sorciere := p_player_count >= 6 and random() < 0.85 and not ('sorciere' = any(v_disabled));
  v_petite_fille := p_player_count >= 8 and random() < 0.55 and not ('petite_fille' = any(v_disabled));
  v_ancien := p_player_count >= 10 and random() < 0.45 and not ('ancien' = any(v_disabled));
  v_voleur := p_player_count >= 11 and random() < 0.45 and not ('voleur' = any(v_disabled));
  v_enfant_sauvage := p_player_count >= 9 and random() < 0.45 and not ('enfant_sauvage' = any(v_disabled));
  v_chasseur := p_player_count >= 6 and random() < 0.3 and not ('chasseur' = any(v_disabled));
  v_cupidon := p_player_count >= 6 and random() < 0.3 and not ('cupidon' = any(v_disabled));
  v_griot := p_player_count >= 9 and random() < 0.25 and not ('griot' = any(v_disabled));
  v_anancy := p_player_count >= 8 and random() < 0.2 and not ('anancy' = any(v_disabled));
  v_ange := p_player_count >= 6 and random() < 0.25 and not ('ange' = any(v_disabled));

  loop
    v_special_total := v_wolves + (case when v_wolf_variant is not null then 1 else 0 end)
      + v_voyante::int + v_sorciere::int + v_petite_fille::int + v_ancien::int + v_voleur::int
      + v_enfant_sauvage::int + v_chasseur::int + v_cupidon::int + v_griot::int + v_anancy::int + v_ange::int;

    exit when v_special_total <= p_player_count - 1;

    if v_ange then v_ange := false;
    elsif v_anancy then v_anancy := false;
    elsif v_griot then v_griot := false;
    elsif v_cupidon then v_cupidon := false;
    elsif v_chasseur then v_chasseur := false;
    elsif v_enfant_sauvage then v_enfant_sauvage := false;
    elsif v_voleur then v_voleur := false;
    elsif v_ancien then v_ancien := false;
    elsif v_petite_fille then v_petite_fille := false;
    elsif v_wolf_variant is not null then
      v_wolf_variant := null;
      v_wolves := v_wolves + 1;
    else
      exit; -- rien de plus à couper (ne devrait jamais arriver en pratique)
    end if;
  end loop;

  return jsonb_build_object(
    'loup_garou', v_wolves,
    'loup_alpha', v_wolf_variant = 'loup_alpha',
    'voyante', v_voyante,
    'sorciere', v_sorciere,
    'chasseur', v_chasseur,
    'petite_fille', v_petite_fille,
    'cupidon', v_cupidon,
    'ancien', v_ancien,
    'voleur', v_voleur,
    'enfant_sauvage', v_enfant_sauvage,
    'griot', v_griot,
    'sans_visage', v_wolf_variant = 'sans_visage',
    'anancy', v_anancy,
    'ange', v_ange,
    'grand_mechant_loup', v_wolf_variant = 'grand_mechant_loup',
    'capitaine', true
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- start_game : garde-fou supplémentaire — rejette explicitement toute
-- configuration (manuelle ou, en théorie, automatique) qui contiendrait un
-- rôle désactivé. La case correspondante est déjà masquée côté client
-- (Lobby.tsx) et compute_default_role_counts ne le tire déjà plus au hasard
-- ci-dessus ; ce contrôle couvre le cas d'un appel direct de l'API en
-- contournant l'interface, et un role_counts manuel qui traînerait en
-- mémoire depuis avant la désactivation du rôle par un admin. Reste
-- identique à la version précédente (0158) sinon.
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

grant execute on function public.start_game(uuid) to authenticated;
