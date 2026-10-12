-- Le Dernier Souffle passe dans le système de stock par rareté (voir 0246/0247) : commun, stock maximum 5, une charge consommée
-- à chaque message final envoyé (un seul par partie, comme avant), rachat possible dès qu'on est sous le plafond.
--
--   * Conversion (une seule fois, rejouable sans effet) : tout artefact à effet 'dernier_souffle' pas encore à stock (le Dernier
--     Souffle, la Flamme des Esprits...) passe en catégorie « rares », rareté commun, stock max 5, rachat immédiat. Prix, nom,
--     description et état actif sont conservés. Un artefact déjà à stock n'est pas touché.
--   * Ceux qui le possédaient à vie reçoivent un stock plein (5 charges).
--   * send_last_words consomme une charge (et ne retient qu'un artefact qui en a encore).
--   * Vue de partie : `my_owns_dernier_souffle` = il reste une charge, ou on l'a utilisé dans cette partie ; nouveau champ
--     `my_dernier_souffle_stock`.
-- À appliquer APRÈS 0247. Rejouable sans risque.
set search_path = public;

do $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
  from public.store_artifacts
  where effect_key = 'dernier_souffle' and max_stock is null;

  -- Garde de rejeu : une fois convertis (max_stock renseigné), ces artefacts ne sont plus sélectionnés, donc relancer la
  -- migration ne redonne pas de charges à ceux qui les ont déjà consommées.
  if v_ids is not null then
    update public.store_artifacts
    set category = 'rares',
        rarity = 'commun',
        max_stock = public.artifact_stock_cap('commun'),
        repurchase_cooldown_hours = 0
    where id = any (v_ids);

    update public.player_artifacts
    set quantity = public.artifact_stock_cap('commun')
    where artifact_id = any (v_ids);
  end if;
end;
$$;

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

  -- Bug corrigé (migration 0177) : sans le filtre "pas déjà utilisé" ni
  -- limit 1, cette recherche pouvait renvoyer N'IMPORTE LEQUEL des
  -- artefacts possédés partageant cet effect_key (le design autorise
  -- explicitement plusieurs objets de catalogue à réutiliser le même
  -- effet, ex. Flamme des Esprits, voir migration 0152) — y compris un
  -- DÉJÀ utilisé cette partie, alors qu'une charge fraîche restait
  -- disponible sur un autre artefact du même joueur. Filtre désormais
  -- directement sur "non utilisé", même patron que kill_player pour
  -- Pierre des Ancêtres/Larme de Renaissance.
  -- Charges (migration 0248) : on ne retient qu'un artefact dont il reste une charge, pas déjà utilisé cette partie, et on
  -- verrouille sa ligne le temps de consommer cette charge.
  select sa.id into v_artifact_id
    from public.store_artifacts sa
    join public.player_artifacts pa on pa.artifact_id = sa.id and pa.user_id = v_user
    where sa.effect_key = 'dernier_souffle'
      and pa.quantity > 0
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = p_game_id and gau.user_id = v_user and gau.artifact_id = sa.id
      )
    limit 1
    for update of pa;

  if v_artifact_id is null then
    raise exception 'Vous n''avez plus de charge de Dernier Souffle, ou vous l''avez déjà utilisé cette partie.';
  end if;

  update public.player_artifacts set quantity = quantity - 1
    where user_id = v_user and artifact_id = v_artifact_id;
  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);

  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous, is_last_words)
  values (p_game_id, 'village', v_user, v_name, v_content, false, true);
end;
$$;

create or replace function public.game_view_artifacts_fields(p_game_id uuid, p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- Le Parchemin fonctionne par charges (migration 0247) : on « le possède » tant qu'il reste une charge, ou si on l'a déjà
    -- activé dans CETTE partie (la dernière charge consommée doit rester visible jusqu'à la fin).
    'my_owns_parchemin_griot', (
      exists (
        select 1 from public.player_artifacts pa
        join public.store_artifacts sa on sa.id = pa.artifact_id
        where pa.user_id = p_user and sa.effect_key = 'parchemin_griot' and pa.quantity > 0
      ) or exists (
        select 1 from public.game_artifact_uses gau
        join public.store_artifacts sa on sa.id = gau.artifact_id
        where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'parchemin_griot'
      )
    ),

    'my_parchemin_griot_stock', coalesce((
      select pa.quantity from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'parchemin_griot'
    ), 0),

    'my_parchemin_griot_used', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'parchemin_griot'
    ),

    -- Par charges (migration 0248) : il reste une charge, ou on l'a déjà utilisé dans CETTE partie.
    'my_owns_dernier_souffle', (
      exists (
        select 1 from public.player_artifacts pa
        join public.store_artifacts sa on sa.id = pa.artifact_id
        where pa.user_id = p_user and sa.effect_key = 'dernier_souffle' and pa.quantity > 0
      ) or exists (
        select 1 from public.game_artifact_uses gau
        join public.store_artifacts sa on sa.id = gau.artifact_id
        where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'dernier_souffle'
      )
    ),

    'my_dernier_souffle_stock', coalesce((
      select sum(pa.quantity)::int from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'dernier_souffle'
    ), 0),

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

    -- L'Œil du Baobab (migration 0246) : charges restantes, et si on l'a déjà utilisé dans CETTE partie, son résultat privé.
    'my_oeil_baobab_stock', coalesce((
      select pa.quantity from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'oeil_baobab'
    ), 0),

    'my_oeil_baobab_result', (
      select gau.meta from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'oeil_baobab'
    ),

    'feu_sacre_saved_me', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'feu_sacre_ancetres'
        and gau.round_number = (select night_number from public.games where id = p_game_id)
    )
  );
$$;
