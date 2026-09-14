-- ============================================================================
-- Sépare la NOTION D'EFFET de l'identifiant libre `key` : jusqu'ici, le
-- moteur de jeu reconnaissait un artefact directement par son `key`
-- (`sa.key = 'parchemin_griot'`) — ce qui mélangeait "l'identité de cet
-- artefact précis" et "le comportement qu'il déclenche". `effect_key` est le
-- nouveau champ FERMÉ (même patron que quest_templates.condition_key,
-- migration 0112) que l'admin choisit dans un menu déroulant au lieu de
-- deviner/copier un identifiant technique — plusieurs artefacts pourront un
-- jour partager le même effet (ex. une variante cosmétique différente du
-- même mécanisme), ce qu'un simple `key` unique ne permettait pas.
--
-- Départ avec 3 effets prédéfinis (l'admin en demandera d'autres plus tard,
-- chacun nécessitera sa propre migration comme pour les conditions de
-- quête) :
--   - 'none'             : aucun effet en jeu (cosmétique/collection pur)
--   - 'parchemin_griot'  : lecture du chat des Loups après élimination
--   - 'dernier_souffle'  : message final au village après élimination
--
-- `key` reste inchangé (identifiant libre unique de CET artefact précis,
-- toujours non modifiable après création) — `effect_key` répond à "que
-- fait-il ?", `key` répond à "lequel est-ce ?".
-- ============================================================================
set search_path = public;

alter table public.store_artifacts add column if not exists effect_key text not null default 'none';

alter table public.store_artifacts drop constraint if exists store_artifacts_effect_key_check;
alter table public.store_artifacts add constraint store_artifacts_effect_key_check
  check (effect_key in ('none', 'parchemin_griot', 'dernier_souffle'));

update public.store_artifacts set effect_key = 'parchemin_griot' where key = 'parchemin_griot';
update public.store_artifacts set effect_key = 'dernier_souffle' where key = 'dernier_souffle';

-- ----------------------------------------------------------------------------
-- Moteur de jeu : bascule de `sa.key` vers `sa.effect_key`.
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
        select 1 from public.player_artifacts pa
        join public.store_artifacts sa on sa.id = pa.artifact_id
        where pa.user_id = auth.uid() and sa.effect_key = 'parchemin_griot'
      );
  end if;

  return false;
end;
$$;

grant execute on function public.can_read_channel(uuid, text) to authenticated;

create or replace function public.send_last_words(p_game_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_content text := trim(p_content);
  v_alive boolean;
  v_name text;
  v_artifact_id uuid;
begin
  if v_content = '' then
    return;
  end if;
  if char_length(v_content) > 500 then
    v_content := left(v_content, 500);
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
    where sa.effect_key = 'dernier_souffle';

  if v_artifact_id is null then
    raise exception 'Vous ne possédez pas cet artefact.';
  end if;

  if exists (
    select 1 from public.game_artifact_uses
    where game_id = p_game_id and user_id = v_user and artifact_id = v_artifact_id
  ) then
    raise exception 'Déjà utilisé dans cette partie.';
  end if;

  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);

  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous, is_last_words)
  values (p_game_id, 'village', v_user, v_name, v_content, false, true);
end;
$$;

grant execute on function public.send_last_words(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Administration : nouveau paramètre p_effect_key. Signature changée —
-- drop explicite avant recréation (voir check-rpc-grants.mjs).
-- ----------------------------------------------------------------------------
drop function if exists public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, boolean);

create or replace function public.admin_upsert_store_artifact(
  p_id uuid,
  p_key text,
  p_name_fr text,
  p_name_en text,
  p_description_fr text,
  p_description_en text,
  p_price_coins int,
  p_category text,
  p_effect_key text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  if p_name_fr is null or length(trim(p_name_fr)) = 0 or p_name_en is null or length(trim(p_name_en)) = 0 then
    raise exception 'Nom requis (FR et EN).';
  end if;
  if p_description_fr is null or length(trim(p_description_fr)) = 0 or p_description_en is null or length(trim(p_description_en)) = 0 then
    raise exception 'Description requise (FR et EN).';
  end if;
  if coalesce(p_price_coins, -1) < 0 then
    raise exception 'Le prix ne peut pas être négatif.';
  end if;
  if p_category not in ('outils', 'rares', 'cosmetiques', 'fragments') then
    raise exception 'Catégorie invalide.';
  end if;
  if p_effect_key not in ('none', 'parchemin_griot', 'dernier_souffle') then
    raise exception 'Effet invalide.';
  end if;

  if p_id is null then
    if p_key is null or p_key !~ '^[a-z0-9_]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, underscore uniquement).';
    end if;
    if exists (select 1 from public.store_artifacts where key = p_key) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_artifacts (key, name_fr, name_en, description_fr, description_en, price_coins, category, effect_key, active)
    values (p_key, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en), p_price_coins, p_category, p_effect_key, coalesce(p_active, true))
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_artifact', v_id::text, jsonb_build_object('key', p_key, 'name_fr', p_name_fr));
  else
    -- `key` n'est jamais modifié ici, quoi que le client envoie dans
    -- p_key — voir migration 0148/0149. `effect_key`, en revanche, reste
    -- librement modifiable : c'est justement le champ que ce menu déroulant
    -- sert à changer.
    update public.store_artifacts
    set name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        description_fr = trim(p_description_fr),
        description_en = trim(p_description_en),
        price_coins = p_price_coins,
        category = p_category,
        effect_key = p_effect_key,
        active = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Artefact introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_store_artifact', v_id::text, jsonb_build_object('name_fr', p_name_fr));
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, boolean) to authenticated;
