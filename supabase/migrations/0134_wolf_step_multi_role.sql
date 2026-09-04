-- ============================================================================
-- Corrige next_night_step : l'étape de nuit 'loup_garou' (le vote de la
-- meute pour dévorer une victime) n'était incluse dans la séquence de la
-- nuit que si `role_alive_exists(p_game_id, 'loup_garou')` était vrai —
-- c'est-à-dire seulement s'il restait un joueur dont le rôle est
-- LITTÉRALEMENT 'loup_garou'. Or l'étape 'loup_garou' est censée être
-- partagée par TOUS les rôles du camp des Loups (loup_garou, loup_alpha,
-- sans_visage, grand_mechant_loup — voir submit_wolf_vote, qui les accepte
-- tous). Dès que plus aucun loup "de base" n'était vivant (mort, ou parce
-- que la composition de la partie n'en comptait aucun), l'étape disparaissait
-- purement et simplement de la séquence pour toutes les nuits suivantes —
-- même si un Loup Alpha, Sans-Visage ou Grand Méchant Loup restait vivant.
-- Ces loups ne pouvaient alors plus jamais dévorer personne jusqu'à la fin
-- de la partie.
--
-- Signalement utilisateur : après un échange Anancy, le nouveau porteur du
-- rôle Sans-Visage ne pouvait plus éliminer. La carte avait bien changé de
-- main (le rôle suit correctement, voir migration 0132), mais si le
-- Loup-Garou "de base" de la partie était déjà mort à ce moment-là, l'étape
-- de nuit elle-même avait disparu — le bug touche donc n'importe quelle
-- combinaison de rôles Loups, pas seulement Anancy.
--
-- Corrigé sur le même principe que le bloc grand_mechant_loup juste
-- au-dessus dans cette fonction : un cas spécial pour 'loup_garou' qui
-- vérifie les 4 rôles du camp au lieu du `role_alive_exists` générique
-- (correct tel quel pour toutes les autres étapes, à rôle unique).
-- ============================================================================
set search_path = public;

create or replace function public.next_night_step(p_game_id uuid, p_night_number integer, p_current text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sequence text[];
  v_found_current boolean := (p_current is null);
  v_step text;
  v_powers_disabled boolean;
  v_wolf_death_occurred boolean;
begin
  select village_powers_disabled into v_powers_disabled from public.games where id = p_game_id;

  if p_night_number <= 1 then
    v_sequence := array['voleur','cupidon','enfant_sauvage','voyante','loup_garou','grand_mechant_loup','sorciere','anancy'];
  else
    v_sequence := array['voyante','griot','loup_garou','grand_mechant_loup','sorciere','anancy'];
  end if;

  foreach v_step in array v_sequence loop
    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;

    if v_step in ('voyante','sorciere','griot') and coalesce(v_powers_disabled, false) then
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

    -- Le pouvoir de seconde victime du Grand Méchant Loup disparaît pour de
    -- bon dès qu'un loup (n'importe lequel, lui compris) est mort — vérifié
    -- ici plutôt que stocké, puisque l'état déjà présent (game_players +
    -- game_roles_secret) suffit à répondre à la question à tout moment.
    if v_step = 'grand_mechant_loup' then
      select exists (
        select 1
        from public.game_roles_secret rs
        join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
        where rs.game_id = p_game_id
          and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
          and not gp.is_alive
      ) into v_wolf_death_occurred;

      if v_wolf_death_occurred then
        continue;
      end if;
    end if;

    -- 'loup_garou' est le vote commun à TOUT le camp des Loups (voir
    -- submit_wolf_vote) — présent tant qu'AU MOINS UN des 4 rôles du camp
    -- est vivant, pas seulement le loup "de base" (voir commentaire
    -- d'en-tête de cette migration).
    if v_step = 'loup_garou' then
      if exists (
        select 1
        from public.game_roles_secret rs
        join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
        where rs.game_id = p_game_id
          and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
          and gp.is_alive
      ) then
        return 'loup_garou';
      end if;
      continue;
    end if;

    if public.role_alive_exists(p_game_id, v_step) then
      return v_step;
    end if;
  end loop;

  return null;
end;
$function$;
