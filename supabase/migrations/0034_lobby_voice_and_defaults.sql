-- ----------------------------------------------------------------------------
-- can_access_channel : nouveau salon 'lobby', ouvert au chat vocal à tous
-- les joueurs déjà dans un salon d'attente (avant le lancement de la
-- partie) — voir Lobby.tsx / useVoiceChat.ts / api/daily-room.ts. Reprise
-- intégrale de la version 0030, avec juste cette branche en plus.
-- ----------------------------------------------------------------------------
create or replace function public.can_access_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_night_step text;
  v_alive boolean;
  v_banned boolean;
  v_role text;
begin
  select status, night_step into v_status, v_night_step from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if; -- pas participant de cette partie
  if v_banned then return false; end if;

  if p_channel = 'lobby' then
    return v_status = 'lobby';
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    return v_alive and v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' or v_night_step <> 'loup_garou' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role = 'loup_garou';
  end if;

  return false;
end;
$$;

-- ----------------------------------------------------------------------------
-- compute_default_role_counts : nouveaux réglages par défaut demandés par
-- l'hôte — Capitaine activé d'office (règle simple à comprendre pour une
-- première partie : élection publique, vote qui compte double), Chasseur et
-- Cupidon désactivés par défaut (rôles à activer volontairement depuis les
-- réglages du salon). Le reste (Voyante/Sorcière/Petite Fille/Ancien/Voleur)
-- garde son échelonnement selon le nombre de joueurs, inchangé depuis 0018.
-- ----------------------------------------------------------------------------
create or replace function public.compute_default_role_counts(p_player_count int)
returns jsonb
language plpgsql
as $$
declare
  v_wolves int;
begin
  v_wolves := greatest(1, round(p_player_count * 0.25));
  if v_wolves >= p_player_count then
    v_wolves := greatest(1, p_player_count / 2);
  end if;
  return jsonb_build_object(
    'loup_garou', v_wolves,
    'voyante', p_player_count >= 5,
    'sorciere', p_player_count >= 6,
    'chasseur', false,
    'petite_fille', p_player_count >= 8,
    'cupidon', false,
    'ancien', p_player_count >= 10,
    'voleur', p_player_count >= 11,
    'capitaine', true
  );
end;
$$;
