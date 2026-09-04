-- ============================================================================
-- Corrige la synchronisation des quêtes du jour : elle ne reposait que sur
-- un appel client fire-and-forget depuis l'écran de fin de partie
-- (EndScreen, GameRoom.tsx — `supabase.rpc('sync_daily_quests_for_game', ...)`
-- sans aucune gestion d'erreur ni retry). Signalement utilisateur : "je
-- viens de faire une partie que j'ai gagné mais le palier des récompenses
-- de quête n'a pas changé" — vérification en base : la table
-- quest_game_sync était COMPLÈTEMENT VIDE (aucune ligne, pour aucun
-- utilisateur, depuis l'introduction des quêtes le 28/08), alors que la
-- fonction elle-même fonctionne parfaitement quand on l'appelle
-- directement avec les bons paramètres — la panne est côté client
-- (l'appel n'aboutit jamais, ou trop tard, avant que le joueur ait déjà
-- quitté l'écran), invisible puisque rien ne loggue ni ne relaie l'erreur.
--
-- Corrigé à la racine plutôt que rafistolé côté client : la progression
-- des quêtes est maintenant calculée côté SERVEUR, pour tous les
-- participants d'un coup, au moment exact où la partie se termine — juste
-- après apply_rank_updates_for_game (déjà appelée de façon fiable par les
-- 3 chemins de fin de partie : village/loups/amoureux, Ange, Anancy), qui
-- vient de poser winner_team et d'écrire game_results.won pour chacun.
-- Ne dépend plus d'aucun écran ouvert ni d'aucune requête réseau côté
-- joueur. L'appel client existant (idempotent via quest_game_sync) reste
-- en place sans dégât : il ne fait plus rien d'utile en temps normal, mais
-- ne casse rien non plus.
-- ============================================================================
set search_path = public;

create or replace function public.sync_daily_quests_for_all_players(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date := current_date;
begin
  for r in
    select gp.user_id, gp.is_alive, rs.role, gr.won
    from public.game_players gp
    join public.profiles p on p.id = gp.user_id and not p.is_bot
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    left join public.game_results gr on gr.game_id = gp.game_id and gr.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    perform public.ensure_daily_quests(r.user_id, v_today);

    if exists (select 1 from public.quest_game_sync where user_id = r.user_id and game_id = p_game_id) then
      continue;
    end if;
    insert into public.quest_game_sync (user_id, game_id) values (r.user_id, p_game_id);

    update public.quest_progress qp
    set progress = least(qp.progress + 1, qt.target)
    from public.quest_templates qt
    where qp.template_id = qt.id
      and qp.user_id = r.user_id and qp.quest_date = v_today and qp.claimed_at is null and qp.progress < qt.target
      and (
        qt.condition_key = 'games_played'
        or (qt.condition_key = 'games_won' and coalesce(r.won, false))
        or (qt.condition_key = 'survived' and coalesce(r.is_alive, false))
        or (qt.condition_key = 'won_as_wolf' and coalesce(r.won, false) and r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'))
        or (qt.condition_key = 'won_as_village' and coalesce(r.won, false) and r.role is not null and r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'ange'))
      );
  end loop;
end;
$$;

create or replace function public.check_and_apply_win(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive int;
  v_wolves int;
  v_winner text;
  v_lover1 uuid;
  v_lover2 uuid;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null or v_status = 'ended' then
    return false;
  end if;

  select count(*) into v_alive from public.game_players where game_id = p_game_id and is_alive;

  select count(*) into v_wolves
  from public.game_roles_secret rs
  join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') and gp.is_alive;

  if v_alive = 2 then
    select user_id into v_lover1 from public.game_players where game_id = p_game_id and is_alive and is_lover limit 1;
    if v_lover1 is not null then
      select lover_with into v_lover2 from public.game_roles_secret where game_id = p_game_id and user_id = v_lover1;
      if v_lover2 is not null and exists (
        select 1 from public.game_players where game_id = p_game_id and user_id = v_lover2 and is_alive
      ) then
        v_winner := 'amoureux';
      end if;
    end if;
  end if;

  if v_winner is null then
    if v_wolves = 0 then
      v_winner := 'village';
    elsif v_wolves >= (v_alive - v_wolves) then
      v_winner := 'loups';
    end if;
  end if;

  if v_winner is not null then
    update public.games set status = 'ended', winner_team = v_winner, phase_deadline = null,
      hunter_pending = null, hunter_context = null, captain_pending = null
    where id = p_game_id;

    insert into public.game_log (game_id, message)
    values (p_game_id, case v_winner
      when 'village' then '🌞 Le village a éliminé tous les Loups-Garous. Le village gagne !'
      when 'loups' then '🐺 Les Loups-Garous ont dévoré assez de villageois pour prendre le contrôle. Les loups gagnent !'
      when 'amoureux' then '💘 Il ne reste que les deux amoureux... L’amour triomphe !'
    end);

    perform public.apply_rank_updates_for_game(p_game_id, v_winner);
    perform public.sync_daily_quests_for_all_players(p_game_id);

    return true;
  end if;

  return false;
end;
$$;

create or replace function public.check_and_apply_ange_win(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_ange_died_round1 boolean;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null or v_status = 'ended' then
    return false;
  end if;

  select exists (
    select 1
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'ange' and not gp.is_alive and gp.died_at_night = 1
  ) into v_ange_died_round1;

  if not v_ange_died_round1 then
    return false;
  end if;

  update public.games set status = 'ended', winner_team = 'ange', phase_deadline = null,
    hunter_pending = null, hunter_context = null, captain_pending = null
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '👼 L''Ange a trouvé la mort dès le premier jour... exactement comme il l''espérait. Il gagne, seul !');

  perform public.apply_rank_updates_for_game(p_game_id, 'ange');
  perform public.sync_daily_quests_for_all_players(p_game_id);

  return true;
end;
$$;

create or replace function public.check_and_apply_anancy_win(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_night int;
  v_status text;
  v_anancy_alive boolean;
begin
  select night_number, status into v_night, v_status from public.games where id = p_game_id;
  if v_status = 'ended' or v_night < 5 then
    return false;
  end if;

  select gp.is_alive into v_anancy_alive
  from public.game_roles_secret rs
  join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role = 'anancy';

  if not coalesce(v_anancy_alive, false) then
    return false;
  end if;

  update public.games set status = 'ended', winner_team = 'anancy', phase_deadline = null,
    hunter_pending = null, hunter_context = null, captain_pending = null
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🕸️ L''aube du cinquième jour se lève... Anancy a survécu et disparaît dans les ombres avec sa propre victoire !');

  perform public.apply_rank_updates_for_game(p_game_id, 'anancy');
  perform public.sync_daily_quests_for_all_players(p_game_id);

  return true;
end;
$$;
