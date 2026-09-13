-- ============================================================================
-- Mode automatique de composition des rôles : jusqu'ici, compute_default_role_
-- counts (voir 0034/0121) n'était utilisée qu'implicitement dans start_game,
-- seulement si l'hôte n'avait jamais ouvert/modifié les réglages du salon.
-- Aucun moyen explicite de l'activer, et l'aperçu affiché dans le tiroir de
-- réglages (les cases cochées par défaut, voir Lobby.tsx) ne reflétait de
-- toute façon pas ce que cette fonction choisirait réellement pour l'effectif
-- présent.
--
-- Demande utilisateur : un bouton "Mode automatique" dans les réglages de
-- l'hôte (salon d'attente uniquement — la composition ne peut de toute façon
-- plus changer une fois la partie démarrée) qui laisse le système choisir une
-- composition équilibrée selon le nombre de joueurs, recalculée au moment
-- réel du lancement (pas figée au moment où le bouton est coché).
--
-- Trois changements :
--   1. Nouvelle fonction preview_auto_role_counts : aperçu en lecture seule
--      de ce que compute_default_role_counts choisirait pour l'effectif
--      ACTUEL du salon — sert à afficher un résumé fidèle côté client sans
--      dupliquer la formule d'équilibrage en TypeScript (voir lib/ranks.ts
--      pour un exemple de ce qui arrive quand une formule est dupliquée des
--      deux côtés et finit par se désynchroniser).
--   2. update_game_settings accepte désormais la clé auto_role_counts
--      (booléen), même patron que les clés existantes.
--   3. start_game : si auto_role_counts est vrai, recalcule TOUJOURS via
--      compute_default_role_counts, même si un role_counts manuel traîne
--      encore dans settings (ex. l'hôte avait personnalisé avant d'activer
--      le mode auto) — c'est ce qui garantit le recalcul au nombre de joueurs
--      réel au moment du clic sur "Lancer la partie".
-- ============================================================================
set search_path = public;

create or replace function public.preview_auto_role_counts(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_count int;
begin
  if not public.is_game_participant(p_game_id) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select count(*) into v_count from public.game_players where game_id = p_game_id;

  return public.compute_default_role_counts(v_count);
end;
$function$;

grant execute on function public.preview_auto_role_counts(uuid) to authenticated;

-- --- update_game_settings : ajoute la clé auto_role_counts -----------------
create or replace function public.update_game_settings(p_game_id uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_clamped jsonb := '{}'::jsonb;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut modifier les réglages.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  if p_settings ? 'role_counts' then
    v_clamped := v_clamped || jsonb_build_object('role_counts', p_settings->'role_counts');
  end if;
  if p_settings ? 'auto_role_counts' then
    v_clamped := v_clamped || jsonb_build_object('auto_role_counts', (p_settings->>'auto_role_counts')::boolean);
  end if;
  if p_settings ? 'role_reveal_intro_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'role_reveal_intro_seconds', greatest(15, least(180, (p_settings->>'role_reveal_intro_seconds')::int))
    );
  end if;
  if p_settings ? 'discussion_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'discussion_seconds', greatest(30, least(900, (p_settings->>'discussion_seconds')::int))
    );
  end if;
  if p_settings ? 'vote_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'vote_seconds', greatest(15, least(180, (p_settings->>'vote_seconds')::int))
    );
  end if;
  if p_settings ? 'vote_recap_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'vote_recap_seconds', greatest(10, least(180, (p_settings->>'vote_recap_seconds')::int))
    );
  end if;
  if p_settings ? 'night_step_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'night_step_seconds', greatest(20, least(180, (p_settings->>'night_step_seconds')::int))
    );
  end if;
  if p_settings ? 'wolf_chat_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'wolf_chat_seconds', greatest(30, least(300, (p_settings->>'wolf_chat_seconds')::int))
    );
  end if;
  if p_settings ? 'voyante_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'voyante_seconds', greatest(20, least(180, (p_settings->>'voyante_seconds')::int))
    );
  end if;
  if p_settings ? 'sorciere_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'sorciere_seconds', greatest(20, least(180, (p_settings->>'sorciere_seconds')::int))
    );
  end if;

  update public.games set settings = v_game.settings || v_clamped where id = p_game_id;
end;
$$;

-- --- start_game : auto_role_counts prend le pas sur un role_counts manuel --
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
    + coalesce((v_role_counts->>'grand_mechant_loup')::boolean::int, 0);

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
