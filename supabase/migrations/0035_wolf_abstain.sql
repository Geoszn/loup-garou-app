-- ----------------------------------------------------------------------------
-- submit_wolf_vote : accepte désormais p_target = null (abstention). Un loup
-- qui s'abstient ne désigne personne — get_wolf_target (migration 0022)
-- ignore déjà les votes à target_id nul dans son dépouillement, donc si
-- TOUS les loups encore en vie s'abstiennent (ou qu'ils se partagent les
-- voix à égalité), personne n'est dévoré cette nuit-là, exactement comme le
-- cas d'égalité déjà géré. Reprise intégrale de 0005_actions.sql, avec la
-- validation du rôle/statut de la cible sautée quand p_target est nul.
-- ----------------------------------------------------------------------------
create or replace function public.submit_wolf_vote(p_game_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_target_role text;
  v_alive_wolves int;
  v_submitted int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n’est pas le moment pour les Loups-Garous.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'loup_garou' then
    raise exception 'Vous n’êtes pas un Loup-Garou.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  if p_target is not null then
    select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target;
    if v_target_role = 'loup_garou' then
      raise exception 'Vous ne pouvez pas dévorer un autre Loup-Garou.';
    end if;
    if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
      raise exception 'Joueur invalide.';
    end if;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'loup_garou', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  select count(*) into v_alive_wolves
  from public.game_roles_secret rs join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role = 'loup_garou' and gp.is_alive;

  select count(distinct actor_id) into v_submitted
  from public.night_actions
  where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou';

  if v_submitted >= v_alive_wolves then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$$;
