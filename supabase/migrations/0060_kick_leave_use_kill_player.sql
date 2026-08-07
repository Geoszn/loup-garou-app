-- ============================================================================
-- BUG : exclure ou voir partir un joueur en cours de partie ne déclenchait
-- aucune des cascades normales d'une mort.
--
-- _remove_player (0030_settings_and_moderation.sql) se contentait de mettre
-- is_alive à false directement, sans jamais passer par kill_player. Résultat,
-- silencieusement à chaque exclusion/départ en cours de partie :
--   - un amoureux exclu ne faisait pas mourir l'autre de chagrin, et
--     personne n'était donc jamais prévenu du lien entre les deux ;
--   - un Capitaine exclu ne déclenchait aucune succession ;
--   - un Chasseur exclu ne tirait pas ;
--   - le rôle du joueur exclu ne devenait jamais public (revealed_role
--     restait null) — ce qui faussait aussi les décomptes "loups/village
--     restants" affichés par RosterSummary.tsx, calculés à partir des rôles
--     révélés des joueurs morts : un loup exclu continuait à compter comme
--     "encore en jeu" quelque part.
--
-- Correctif : passe par kill_player, exactement comme pour une mort
-- "normale" (vote, nuit, tir du Chasseur...). death_phrase gagne une entrée
-- 'exclu' pour que le journal reste lisible (au lieu de "est mort.").
-- ============================================================================
set search_path = public;

create or replace function public.death_phrase(p_cause text)
returns text
language sql
immutable
as $$
  select case p_cause
    when 'loup_garou' then 'a été dévoré par les Loups-Garous cette nuit.'
    when 'sorciere' then 'a été empoisonné par la Sorcière cette nuit.'
    when 'chagrin' then 'est mort de chagrin, son amoureux ayant péri.'
    when 'chasseur' then 'a été abattu par le Chasseur.'
    when 'vote' then 'a été éliminé par le vote du village.'
    when 'petite_fille_surprise' then 'a été surprise en train d’espionner les loups... et en a payé le prix.'
    when 'parti' then 'a quitté la partie.'
    when 'exclu' then 'a été exclu(e) de la partie par l’hôte.'
    else 'est mort.'
  end;
$$;

create or replace function public._remove_player(p_game_id uuid, p_user_id uuid, p_kicked boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_name text;
  v_was_host boolean;
  v_next_host uuid;
  v_verb text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then return; end if;

  select display_name, is_host into v_name, v_was_host
  from public.game_players where game_id = p_game_id and user_id = p_user_id;

  if v_name is null then return; end if;

  if v_game.status in ('lobby', 'ended') then
    delete from public.game_players where game_id = p_game_id and user_id = p_user_id;
    delete from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if v_was_host then
      select user_id into v_next_host from public.game_players
      where game_id = p_game_id order by seat_number asc limit 1;
      if v_next_host is not null then
        update public.game_players set is_host = true where game_id = p_game_id and user_id = v_next_host;
        update public.games set host_id = v_next_host where id = p_game_id;
      end if;
    end if;

    if not exists (select 1 from public.game_players where game_id = p_game_id) then
      delete from public.games where id = p_game_id;
      return;
    end if;

    v_verb := case when p_kicked then ' a été retiré(e) du salon par l’hôte.' else ' a quitté le salon.' end;
    insert into public.game_log (game_id, message) values (p_game_id, v_name || v_verb);
  else
    -- Voir kill_player pour tout le détail des cascades (amoureux, Chasseur,
    -- succession du Capitaine, Enfant Sauvage, rôle révélé...) — désormais
    -- appliquées aussi à une exclusion/un départ, comme pour toute mort.
    perform public.kill_player(
      p_game_id, p_user_id,
      case when p_kicked then 'exclu' else 'parti' end,
      v_game.night_number
    );

    -- is_banned doit être posé même si le joueur était déjà mort (on bannit
    -- un fantôme a posteriori) : kill_player ne touche pas cette colonne et
    -- ne fait rien si is_alive était déjà à false, donc on le fait toujours
    -- ici, séparément — comme avant ce correctif.
    if p_kicked then
      update public.game_players set is_banned = true where game_id = p_game_id and user_id = p_user_id;
    end if;

    if v_was_host then
      select user_id into v_next_host from public.game_players
      where game_id = p_game_id and user_id <> p_user_id order by seat_number asc limit 1;
      if v_next_host is not null then
        update public.game_players set is_host = false where game_id = p_game_id and user_id = p_user_id;
        update public.game_players set is_host = true where game_id = p_game_id and user_id = v_next_host;
        update public.games set host_id = v_next_host where id = p_game_id;
      end if;
    end if;

    perform public.check_and_apply_win(p_game_id);
  end if;
end;
$$;
