-- ============================================================================
-- Demande utilisateur : les artefacts "actifs" (utilisables pendant une
-- partie) doivent pouvoir être déclenchés par le JOUEUR quand il le
-- souhaite, pas uniquement quand le système l'impose. Contrairement à la
-- Pierre des Ancêtres / Larme de Renaissance (auto-revive, migration 0172 —
-- le joueur garde déjà le principe accepté) et à la Balance de l'Ange,
-- le Parchemin du Griot était jusqu'ici purement PASSIF : la simple
-- possession de l'artefact (player_artifacts) suffisait à afficher le chat
-- des Loups à un ex-loup mort, sans le moindre geste de sa part
-- (can_read_channel, migration 0148/0150).
--
-- Ce correctif introduit une activation explicite, une fois par partie :
--   1. use_parchemin_griot : nouvelle RPC, appelée depuis le nouveau menu
--      "🎒 Mes artefacts" (ArtifactsMenu.tsx, ouvert depuis GameRoom.tsx)
--      avec double confirmation côté client. Réservée aux joueurs déjà
--      éliminés ET de l'équipe des Loups, comme le garde déjà
--      can_read_channel plus bas.
--      Utilisable À TOUT MOMENT (jour ou nuit) — seule la LECTURE du salon
--      "wolves" reste réservée à la nuit (règle déjà existante, non
--      remise en cause ici, la nuit étant le seul moment où ce salon a du
--      contenu pertinent).
--   2. can_read_channel : le sous-cas fantôme du salon "wolves" vérifie
--      désormais game_artifact_uses (activé CETTE partie) au lieu de
--      player_artifacts (simple possession) — même bascule que celle déjà
--      faite pour dernier_souffle/feu_sacre_ancetres ailleurs dans le
--      moteur.
--   3. game_view_artifacts_fields : nouveau champ my_parchemin_griot_used,
--      pour que le client sache s'il doit proposer le bouton "Utiliser" ou
--      afficher "Activé" dans le menu artefacts.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. use_parchemin_griot : active l'artefact pour la partie en cours.
-- ----------------------------------------------------------------------------
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
  v_role text;
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

  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  if v_role is null or v_role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup') then
    raise exception 'Réservé aux membres de la meute.';
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

grant execute on function public.use_parchemin_griot(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. can_read_channel : le salon "wolves" côté fantôme exige maintenant une
--    activation (game_artifact_uses), plus la simple possession.
-- ----------------------------------------------------------------------------
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
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    if v_alive then
      return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup');
    end if;
    return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
      and exists (
        select 1 from public.game_artifact_uses gau
        join public.store_artifacts sa on sa.id = gau.artifact_id
        where gau.game_id = p_game_id and gau.user_id = auth.uid() and sa.effect_key = 'parchemin_griot'
      );
  end if;

  return false;
end;
$$;

grant execute on function public.can_read_channel(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. game_view_artifacts_fields : expose my_parchemin_griot_used.
-- ----------------------------------------------------------------------------
create or replace function public.game_view_artifacts_fields(p_game_id uuid, p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_owns_parchemin_griot', exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'parchemin_griot'
    ),

    'my_parchemin_griot_used', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'parchemin_griot'
    ),

    'my_owns_dernier_souffle', exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'dernier_souffle'
    ),

    'my_dernier_souffle_used', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'dernier_souffle'
    ),

    'vote_history', case when exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'boussole_village'
    ) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_number', v.round_number, 'voter_id', v.voter_id, 'target_id', v.target_id
      ) order by v.round_number, v.voter_id)
      from public.votes v
      where v.game_id = p_game_id and v.round_number > 0
        and v.round_number < (select night_number from public.games where id = p_game_id)
        and v.target_id is not null
    ), '[]'::jsonb) else null end,

    'feu_sacre_saved_me', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'feu_sacre_ancetres'
        and gau.round_number = (select night_number from public.games where id = p_game_id)
    )
  );
$$;
