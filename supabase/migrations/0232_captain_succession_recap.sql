-- Capitaine mort : le choix de son successeur est bien respecté, mais le récap (écran du
-- matin) n'affichait que la ligne « X était le Capitaine : il ou elle désigne son successeur
-- dans son dernier souffle » — jamais « Y devient le nouveau Capitaine ». Cause : le message
-- d'annonce du successeur était écrit dans le journal SANS numéro de nuit, alors que le récap
-- ne montre que les lignes de la nuit en cours. Il porte maintenant le numéro de la nuit.
-- Même fonction qu'en 0018, seule cette ligne change. Rejouable sans risque.
set search_path = public;

create or replace function public.submit_captain_succession(p_game_id uuid, p_successor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_successor_name text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.captain_pending is distinct from v_user then
    raise exception 'Ce n’est pas à vous de désigner le nouveau Capitaine.';
  end if;

  select display_name into v_successor_name
  from public.game_players where game_id = p_game_id and user_id = p_successor_id and is_alive;
  if v_successor_name is null then
    raise exception 'Le successeur doit être un joueur actuellement en vie.';
  end if;

  update public.game_players set is_captain = false where game_id = p_game_id and user_id = v_user;
  update public.game_players set is_captain = true where game_id = p_game_id and user_id = p_successor_id;
  update public.games set captain_pending = null where id = p_game_id;

  insert into public.game_log (game_id, message, night_number)
  values (p_game_id, '🎖️ ' || v_successor_name || ' devient le nouveau Capitaine.', v_game.night_number);

  perform public.advance_phase(p_game_id, true);
end;
$$;

revoke execute on function public.submit_captain_succession(uuid, uuid) from public, anon;
grant execute on function public.submit_captain_succession(uuid, uuid) to authenticated;
