-- Demande utilisateur : "quand la sorcière a fini d'utiliser ses deux
-- potions elle n'a plus rien à faire la nuit donc plus de compteur de temps
-- pour elle." next_night_step() ne vérifiait jusqu'ici que l'existence d'une
-- Sorcière VIVANTE (role_alive_exists), jamais si elle avait encore une
-- potion à utiliser — une fois les deux potions consommées, son tour
-- continuait donc à être programmé chaque nuit, faisant tourner un
-- décompte complet (et donc attendre tout le monde) pour une étape où elle
-- n'a plus rien à faire.
--
-- Correctif : l'étape 'sorciere' n'est désormais retenue que s'il existe une
-- Sorcière vivante avec AU MOINS une des deux potions encore disponible.

create or replace function public.next_night_step(p_game_id uuid, p_night_number integer, p_current text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence text[];
  v_found_current boolean := (p_current is null);
  v_step text;
  v_powers_disabled boolean;
begin
  select village_powers_disabled into v_powers_disabled from public.games where id = p_game_id;

  if p_night_number <= 1 then
    v_sequence := array['voleur','cupidon','enfant_sauvage','voyante','loup_garou','sorciere'];
  else
    v_sequence := array['voyante','loup_garou','sorciere'];
  end if;

  foreach v_step in array v_sequence loop
    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;

    if v_step in ('voyante','sorciere') and coalesce(v_powers_disabled, false) then
      continue;
    end if;

    if v_step = 'sorciere' and not exists (
      select 1
      from public.game_roles_secret rs
      join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
      where rs.game_id = p_game_id and rs.role = 'sorciere' and gp.is_alive
        and (not coalesce(rs.heal_potion_used, false) or not coalesce(rs.poison_potion_used, false))
    ) then
      continue;
    end if;

    if public.role_alive_exists(p_game_id, v_step) then
      return v_step;
    end if;
  end loop;

  return null;
end;
$$;

grant execute on function public.next_night_step(uuid, integer, text) to authenticated;
