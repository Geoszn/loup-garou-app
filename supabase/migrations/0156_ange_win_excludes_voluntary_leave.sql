-- Bug signalé par l'utilisateur : un joueur Ange qui QUITTE volontairement
-- la partie (ou qui est exclu par l'hôte) pendant la nuit 1 / le jour 1 se
-- voit crédité de la victoire solo de l'Ange, exactement comme s'il avait
-- été réellement éliminé par le village ou les loups. Un cas concret a été
-- rapporté : un joueur Ange a quitté la partie durant la toute première
-- nuit et la partie s'est terminée en "victoire de l'Ange" — alors que ce
-- n'était ni un choix du village, ni celui des loups, juste un départ.
--
-- Cause : check_and_apply_ange_win (migration 0136) ne regarde que
-- `not gp.is_alive and gp.died_at_night = 1`, sans jamais tenir compte de
-- `death_cause`. Or quitter la partie (leave_game) et être exclu par
-- l'hôte (kick_player) passent tous les deux par kill_player avec pour
-- cause respectivement 'parti' et 'exclu' (voir migration 0060) —
-- exactement le même traitement qu'une VRAIE mort (is_alive=false,
-- died_at_night renseigné), donc indiscernable pour ce test.
--
-- Le design original de l'Ange (voir migration 0121) voulait volontairement
-- que la victoire compte "peu importe la cause" de mort au premier
-- cycle — mais l'intention était de couvrir les causes de mort du JEU
-- (loups, sorcière, vote, chasseur, chagrin...), jamais un départ ou une
-- exclusion, qui ne sont pas des morts au sens du jeu.
--
-- Correctif : exclut explicitement 'parti' et 'exclu' de la condition de
-- victoire de l'Ange. Un Ange qui quitte ou qui est exclu pendant le
-- premier cycle ne fait plus gagner personne — la partie continue
-- normalement pour les joueurs restants, exactement comme un départ de
-- n'importe quel autre rôle en dehors des cas de victoire dédiés.
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
      and gp.death_cause not in ('parti', 'exclu')
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
