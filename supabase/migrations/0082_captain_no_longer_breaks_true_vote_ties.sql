-- ============================================================================
-- Changement de règle demandé explicitement par l'hôte : le vote du Capitaine
-- compte toujours pour 2 voix dans le total (inchangé — ça reste ce qui lui
-- permet de faire pencher une majorité, ex. 4 voix contre 3), mais s'il reste
-- malgré ce poids double une VRAIE égalité pondérée entre deux camps (ex. 2
-- contre 2, où le Capitaine est l'un des deux votants d'un côté), son choix
-- personnel ne tranche plus. Dans ce cas, comme n'importe quelle égalité
-- sans Capitaine : personne n'est éliminé ce jour-là.
--
-- Reprise intégrale de la version actuelle, seul changement : la branche
-- "égalité + Capitaine ayant voté" ne tue plus v_captain_target, elle logue
-- le même message générique que l'égalité sans Capitaine. v_captain_target
-- devient donc inutile et est retiré (last_vote_captain_id, qui sert
-- uniquement à l'affichage du récap de vote côté client, reste inchangé).
-- ============================================================================
set search_path = public;

create or replace function public.resolve_day_vote_deaths(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round int;
  v_top record;
  v_tie_count int;
  v_captain_id uuid;
begin
  select night_number into v_round from public.games where id = p_game_id;

  select gp.user_id into v_captain_id
  from public.game_players gp
  where gp.game_id = p_game_id and gp.is_alive and gp.is_captain
  limit 1;

  -- Capturé maintenant, pendant que c'est encore fiable : une fois
  -- kill_player appelée plus bas, une succession du Capitaine peut avoir
  -- lieu avant que le récap du vote ne soit affiché au client. Toujours
  -- utile pour l'affichage du récap (qui a voté en tant que Capitaine),
  -- même si son vote ne départage plus les égalités.
  update public.games set last_vote_captain_id = v_captain_id where id = p_game_id;

  select v.target_id, sum(case when v.voter_id = v_captain_id then 2 else 1 end) as votes
  into v_top
  from public.votes v
  where v.game_id = p_game_id and v.round_number = v_round and v.target_id is not null
  group by v.target_id
  order by votes desc
  limit 1;

  if v_top.target_id is null then
    insert into public.game_log (game_id, message)
    values (p_game_id, '🗳️ Aucun vote exprimé : personne n’est éliminé aujourd’hui.');
  else
    select count(*) into v_tie_count
    from (
      select v.target_id, sum(case when v.voter_id = v_captain_id then 2 else 1 end) as c
      from public.votes v
      where v.game_id = p_game_id and v.round_number = v_round and v.target_id is not null
      group by v.target_id
      having sum(case when v.voter_id = v_captain_id then 2 else 1 end) = v_top.votes
    ) t;

    if v_tie_count > 1 then
      -- Changement de règle : plus de départage par le Capitaine ici — une
      -- vraie égalité pondérée (le poids double du Capitaine ne suffit pas à
      -- lui seul à trancher) se comporte désormais exactement comme une
      -- égalité sans Capitaine.
      insert into public.game_log (game_id, message)
      values (p_game_id, '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.');
    else
      perform public.kill_player(p_game_id, v_top.target_id, 'vote', v_round);
    end if;
  end if;

  update public.games set day_vote_resolved = true where id = p_game_id;
end;
$$;

grant execute on function public.resolve_day_vote_deaths(uuid) to authenticated;
