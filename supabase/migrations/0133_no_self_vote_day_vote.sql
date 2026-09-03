-- ============================================================================
-- Interdit de voter pour soi-même lors du vote d'élimination du village
-- (submit_vote / day_vote) — demande utilisateur explicite. L'auto-vote
-- reste en revanche autorisé pour l'élection du Capitaine
-- (submit_captain_vote) : l'auto-nomination y est un mécanisme voulu, pas
-- concerné par cette demande.
-- ============================================================================
set search_path = public;

create or replace function public.submit_vote(p_game_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive int;
  v_submitted int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'day_vote' then
    raise exception 'Le vote n’est pas ouvert.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Seuls les joueurs vivants peuvent voter.';
  end if;
  if p_target = v_user then
    raise exception 'Vous ne pouvez pas voter pour vous-même.';
  end if;
  if p_target is not null and not exists (
    select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive
  ) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.votes (game_id, round_number, voter_id, target_id)
  values (p_game_id, v_game.night_number, v_user, p_target)
  on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;

  select count(*) into v_alive from public.game_players where game_id = p_game_id and is_alive;
  select count(distinct voter_id) into v_submitted from public.votes where game_id = p_game_id and round_number = v_game.night_number;

  if v_submitted >= v_alive then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$function$;
