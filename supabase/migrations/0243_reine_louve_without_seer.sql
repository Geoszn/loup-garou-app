-- Reine Louve : le tour de la Reine joue désormais même quand la partie n'a aucune Voyante.
--
-- Avant (0242), l'étape était ignorée s'il n'existait aucune Voyante dans la composition. Résultat constaté en test :
-- une partie sans Voyante ne donnait jamais la main à la Reine, qui semblait ne rien pouvoir faire. L'étape reste utile
-- à tester, ne révèle rien (la composition est publique) et ne coûte qu'une étape de 30 s quand la Reine est vivante.
-- Rejouable sans risque. À appliquer APRÈS 0242.

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
    v_sequence := array['daron','voleur','cupidon','enfant_sauvage','reine_louve','voyante','loup_garou','grand_mechant_loup','sorciere','anancy'];
  else
    v_sequence := array['daron','reine_louve','voyante','griot','loup_garou','grand_mechant_loup','sorciere','anancy'];
  end if;

  foreach v_step in array v_sequence loop
    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;

    if v_step in ('voyante','sorciere','griot','daron','reine_louve') and coalesce(v_powers_disabled, false) then
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
          and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
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
          and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
          and gp.is_alive
      ) then
        return 'loup_garou';
      end if;
      continue;
    end if;

    -- Reine Louve (migrations 0242 et 0243) : elle agit AVANT la Voyante, tant qu'elle est vivante et qu'il reste un loup
    -- qu'elle n'a pas encore couvert. L'étape joue même sans Voyante dans la partie (ou si elle est morte) : ainsi elle ne
    -- révèle rien sur l'état de la Voyante, et un test sans Voyante reste possible.
    if v_step = 'reine_louve' then
      if public.role_alive_exists(p_game_id, 'reine_louve')
         and coalesce(array_length(public.reine_louve_eligible_ids(p_game_id), 1), 0) > 0 then
        return 'reine_louve';
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
