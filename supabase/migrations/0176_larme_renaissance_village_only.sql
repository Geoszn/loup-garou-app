-- ============================================================================
-- Réserve la Larme de Renaissance au camp village — retour utilisateur :
-- contrairement à la Pierre des Ancêtres (qui conserve le rôle d'origine à
-- la résurrection), la Larme renvoie TOUJOURS le joueur en simple
-- Villageois. Un Loup ressuscité de cette façon se retrouverait à connaître
-- l'identité des autres Loups tout en étant officiellement villageois —
-- libre de les trahir sans aucune incohérence, ce qui casse l'équilibre du
-- jeu. kill_player exclut désormais les rôles loups de l'éligibilité à la
-- Larme (la Pierre reste, elle, disponible à tous, puisqu'elle ne change
-- jamais de camp). Description mise à jour en boutique pour préciser cette
-- restriction, jamais mentionnée jusqu'ici.
-- ============================================================================
set search_path = public;

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
  v_pierre_artifact_id uuid;
  v_larme_artifact_id uuid;
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

  -- Pierre des Ancêtres (migration 0152/0153) / Larme de Renaissance
  -- (migration 0169) : retour utilisateur (migration 0172) — jusqu'ici,
  -- posséder l'un de ces deux artefacts déclenchait la résurrection
  -- automatiquement, sans qu'on demande au joueur s'il la voulait. Se
  -- contente désormais de repérer l'artefact éligible (Pierre en priorité,
  -- Larme sinon, jamais les deux) et de poser une VRAIE question
  -- (games.revival_pending / revival_pending_artifact_id) — la
  -- consommation réelle (pending_revival, quantity, game_artifact_uses)
  -- n'a lieu que dans submit_revival_choice, uniquement si le joueur
  -- répond oui. Exclu du bûcher/kick de l'hôte ('exclu' n'est de toute
  -- façon jamais une cause passée à kill_player).
  if p_cause <> 'exclu' then
    select pa.artifact_id into v_pierre_artifact_id
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = p_user_id and sa.effect_key = 'pierre_ancetres' and pa.quantity > 0
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
      )
    limit 1;

    -- Larme de Renaissance réservée au camp village (retour utilisateur,
    -- migration 0176) : contrairement à la Pierre ci-dessus (qui conserve
    -- le rôle d'origine), la Larme renvoie TOUJOURS en simple Villageois —
    -- un Loup ressuscité ainsi se retrouverait à connaître les autres Loups
    -- tout en étant officiellement villageois, libre de les trahir sans
    -- aucune incohérence de camp. v_role est déjà celui d'AVANT la mort
    -- (lu en tout début de fonction), donc ce test capture bien "était-il
    -- loup au moment de mourir", peu importe qui l'a tué.
    if v_pierre_artifact_id is null and v_role <> all(array['loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup']) then
      select pa.artifact_id into v_larme_artifact_id
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user_id and sa.effect_key = 'larme_renaissance' and pa.quantity > 0
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
        )
      limit 1;
    end if;

    if coalesce(v_pierre_artifact_id, v_larme_artifact_id) is not null then
      update public.games
      set revival_pending = p_user_id,
          revival_pending_artifact_id = coalesce(v_pierre_artifact_id, v_larme_artifact_id)
      where id = p_game_id and revival_pending is null;
    end if;
  end if;

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
-- Description en boutique : précise désormais la restriction au camp
-- village, jamais mentionnée jusqu'ici.
-- ----------------------------------------------------------------------------
update public.store_artifacts
set
  description_fr = 'Permet un retour en jeu au jour qui suit ton élimination — mais tu reviens en simple Villageois(e), ayant tout oublié de ton rôle d''origine. Réservé au camp village : un Loup-Garou éliminé ne peut pas l''utiliser. Une fois par partie.',
  description_en = 'Allows you to come back to life on the day after your elimination — but you return as a plain Villager, having forgotten your original role entirely. Reserved for the village camp: an eliminated Werewolf cannot use it. Once per game.'
where key = 'larme_renaissance';
