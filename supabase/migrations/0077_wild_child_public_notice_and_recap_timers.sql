-- ============================================================================
-- Deux changements demandés, indépendants :
--
-- 1. Enfant Sauvage → Loup-Garou : annonce publique ANONYME. Depuis la
--    migration 0069, cette conversion ne produisait plus aucun message
--    public du tout (corrigeait une fuite d'identité). Nouvelle demande :
--    tout le monde doit être notifié QU'UN changement de statut a eu lieu
--    cette nuit-là, sans jamais dire qui — un juste milieu entre "silence
--    total" (0069) et "révèle le nom et l'ancien rôle" (avant 0069). Le
--    message est générique, ne cite ni nom ni rôle, et rejoint le récap de
--    nuit de tout le monde comme n'importe quelle autre ligne (via
--    game_log.night_number, voir migration 0043).
--
-- 2. Durée des récaps (nuit ET vote) à 30s par défaut, partout : le récap de
--    nuit (role_reveal_seconds, malgré son nom trompeur — voir advance_phase
--    en 0058) était déjà à 30s par défaut depuis 0048. Seul vote_recap_seconds
--    restait à 90s : ramené à 30s dans create_game, comme demandé
--    ("que ce soit la nuit, le jour ou autre" — les deux écrans de récap
--    doivent avoir la même durée par défaut). Un hôte peut toujours
--    personnaliser cette valeur dans le salon (update_game_settings,
--    inchangé, bornes 10-180s).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- kill_player : reprise intégrale de 0069_wild_child_private_reveal.sql,
-- seul ajout — un message public générique (aucun nom, aucun rôle) une fois
-- la boucle de conversion terminée, uniquement si au moins une conversion a
-- eu lieu cette nuit-là.
-- ----------------------------------------------------------------------------
create or replace function public.kill_player(p_game_id uuid, p_user_id uuid, p_cause text, p_night int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
  v_is_lover boolean;
  v_was_captain boolean;
  v_lover_id uuid;
  v_ancien_used boolean;
  v_wild_child_id uuid;
  v_any_wild_child_converted boolean := false;
begin
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

  if p_cause = 'loup_garou' and v_role = 'ancien' then
    select ancien_extra_life_used into v_ancien_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if not coalesce(v_ancien_used, false) and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = p_user_id and is_alive
    ) then
      update public.game_roles_secret set ancien_extra_life_used = true
      where game_id = p_game_id and user_id = p_user_id;

      insert into public.game_log (game_id, message, night_number)
      select p_game_id, gp.display_name || ' (Ancien) encaisse l’attaque des Loups-Garous et s’accroche à la vie !', p_night
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = p_user_id;

      return;
    end if;
  end if;

  update public.game_players
  set is_alive = false, death_cause = p_cause, died_at_night = p_night, revealed_role = v_role
  where game_id = p_game_id and user_id = p_user_id and is_alive = true
  returning display_name, is_lover, is_captain into v_name, v_is_lover, v_was_captain;

  if v_name is null then
    return; -- déjà mort, rien à faire
  end if;

  insert into public.game_log (game_id, message, night_number)
  values (p_game_id, v_name || ' (' || public.role_display_name(v_role) || ') ' || public.death_phrase(p_cause), p_night);

  if v_role = 'ancien' and p_cause = 'vote' then
    update public.games set village_powers_disabled = true where id = p_game_id;
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '⚖️ Le village a eu tort de lyncher l’Ancien : ses pouvoirs spéciaux s’éteignent pour le reste de la partie...', p_night);
  end if;

  -- Un Enfant Sauvage vivant avait choisi cette victime comme mentor : il
  -- rejoint immédiatement et définitivement les Loups-Garous. Une boucle
  -- plutôt qu'un simple `if` : rien n'empêche plusieurs Enfants Sauvages
  -- d'avoir choisi le même mentor. Toujours aucun message nommant le joueur
  -- ni révélant son ancien rôle (wild_child_turned_at_night reste la seule
  -- trace privée, voir get_my_game_view) — seul le fait qu'UNE conversion a
  -- eu lieu cette nuit est maintenant annoncé publiquement, une fois, après
  -- la boucle.
  for v_wild_child_id in
    select rs.user_id
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'enfant_sauvage'
      and rs.wild_child_mentor = p_user_id and gp.is_alive
  loop
    update public.game_roles_secret
    set role = 'loup_garou', wild_child_turned_at_night = p_night
    where game_id = p_game_id and user_id = v_wild_child_id;
    v_any_wild_child_converted := true;
  end loop;

  if v_any_wild_child_converted then
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '🌑 Une ombre a changé de camp cette nuit... un villageois a secrètement rejoint les Loups-Garous.', p_night);
  end if;

  if v_is_lover then
    select lover_with into v_lover_id from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
    if v_lover_id is not null and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = v_lover_id and is_alive
    ) then
      perform public.kill_player(p_game_id, v_lover_id, 'chagrin', p_night);
    end if;
  end if;

  if v_role = 'chasseur' then
    update public.games
    set hunter_pending = p_user_id,
        hunter_context = case when status = 'day_vote' then 'day' else 'night' end
    where id = p_game_id and hunter_pending is null and not village_powers_disabled;
  end if;

  if v_was_captain then
    update public.games set captain_pending = p_user_id where id = p_game_id and captain_pending is null;
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, v_name || ' était le Capitaine : il ou elle désigne son successeur dans son dernier souffle.', p_night);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- create_game : reprise intégrale de 0048_admin_rpcs.sql, seul changement —
-- vote_recap_seconds par défaut 90 -> 30 (même signature, pas de risque de
-- surcharge : voir la note dans les migrations 0075/0076 sur ce piège).
-- ----------------------------------------------------------------------------
create or replace function public.create_game(p_display_name text, p_settings jsonb default null, p_is_public boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_game_id uuid;
  v_settings jsonb;
  v_icon text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if exists (select 1 from public.profiles where id = v_user and is_banned) then
    raise exception 'Votre compte a été suspendu.';
  end if;

  if not (select new_games_enabled from public.app_settings where id = 1) then
    raise exception 'La création de nouvelles parties est temporairement désactivée.';
  end if;

  select avatar_icon into v_icon from public.profiles where id = v_user;

  v_code := public.generate_game_code();
  v_settings := jsonb_build_object(
    'discussion_seconds', coalesce((p_settings->>'discussion_seconds')::int, 300),
    'vote_seconds', coalesce((p_settings->>'vote_seconds')::int, 45),
    'vote_recap_seconds', coalesce((p_settings->>'vote_recap_seconds')::int, 30),
    'night_step_seconds', coalesce((p_settings->>'night_step_seconds')::int, 70),
    'wolf_chat_seconds', coalesce((p_settings->>'wolf_chat_seconds')::int, 180),
    'role_reveal_seconds', coalesce((p_settings->>'role_reveal_seconds')::int, 30),
    'role_counts', p_settings->'role_counts'
  );

  insert into public.games (code, host_id, settings, is_public)
  values (v_code, v_user, v_settings, coalesce(p_is_public, false))
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 1, true, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game_id, 'La partie a été créée. En attente des joueurs...');

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;
