-- ============================================================================
-- Demande utilisateur : "donne la possibilité à tout le monde de pouvoir
-- utiliser" le Parchemin du Griot. Jusqu'ici (migration 0179) l'artefact
-- n'était utilisable que par un joueur éliminé ET de l'équipe des Loups
-- (lecture du chat de son ex-meute). Désormais : tout joueur ÉLIMINÉ, quel
-- que soit son rôle, peut l'activer (une fois par partie, à tout moment) et
-- lire le chat des Loups la nuit. Un joueur encore en vie ne peut toujours
-- pas l'utiliser (il n'a de toute façon aucun accès au salon des Loups).
--
--   1. use_parchemin_griot : retire le contrôle "réservé aux membres de la
--      meute" (v_role) — le reste est inchangé (partie non terminée,
--      joueur éliminé, artefact possédé, une seule activation par partie).
--   2. can_read_channel : le sous-cas fantôme du salon "wolves" ne teste plus
--      le rôle du joueur, seulement l'activation de l'artefact cette partie.
--      Les Loups vivants gardent leur accès normal, et la lecture reste
--      limitée à la nuit (règle existante).
--   3. Description du produit : reformulée UNIQUEMENT si elle porte encore le
--      texte d'origine (migration 0148, "ancienne meute") — une description
--      déjà modifiée à la main depuis le dashboard admin n'est jamais écrasée.
-- ============================================================================
set search_path = public;

create or replace function public.use_parchemin_griot(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_alive boolean;
  v_artifact_id uuid;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null or v_status = 'ended' then
    raise exception 'Cette partie est terminée.';
  end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  if v_alive is null then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;
  if v_alive then
    raise exception 'Réservé aux joueurs éliminés.';
  end if;

  select sa.id into v_artifact_id
    from public.store_artifacts sa
    join public.player_artifacts pa on pa.artifact_id = sa.id and pa.user_id = v_user
    where sa.effect_key = 'parchemin_griot';

  if v_artifact_id is null then
    raise exception 'Vous ne possédez pas cet artefact.';
  end if;

  if exists (
    select 1 from public.game_artifact_uses
    where game_id = p_game_id and user_id = v_user and artifact_id = v_artifact_id
  ) then
    raise exception 'Déjà activé dans cette partie.';
  end if;

  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);
end;
$$;

create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then
    -- Pas participant de la partie : peut-être un spectateur avec une
    -- demande de rejoindre en attente (voir get_spectator_game_view) —
    -- mêmes salons qu'un fantôme, en lecture seule uniquement.
    if p_channel in ('village', 'graveyard') and exists (
      select 1 from public.game_join_requests
      where game_id = p_game_id and user_id = auth.uid() and status = 'pending'
    ) then
      return true;
    end if;
    return false;
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
    else
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if v_status <> 'night' then
      return false;
    end if;
    if v_alive then
      select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
      return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup');
    end if;
    return exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = auth.uid() and sa.effect_key = 'parchemin_griot'
    );
  end if;

  return false;
end;
$$;

update public.store_artifacts
set description_fr = 'Une fois éliminé, active-le pour lire les messages des Loups pendant les nuits suivantes.',
    description_en = 'Once eliminated, activate it to read the Wolves'' messages during the following nights.'
where effect_key = 'parchemin_griot'
  and description_fr = 'Une fois éliminé, continue de suivre les messages de ton ancienne meute de Loups pendant les nuits suivantes.';
