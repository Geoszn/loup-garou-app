-- Le Parchemin du Griot passe dans le système de stock par rareté (voir 0246) : commun, stock maximum 5, une charge consommée à
-- chaque activation en partie (une activation par partie, comme avant), rachat possible dès qu'on est sous le plafond.
--
--   * Conversion (une seule fois, rejouable sans effet) : l'artefact passe de la catégorie « outils » (achat unique, à vie) à
--     « rares » (stock), rareté commun, stock max 5, rachat immédiat. Prix, nom, description et état actif sont conservés.
--   * Ceux qui le possédaient à vie reçoivent un stock plein (5 charges) plutôt que de perdre ce qu'ils ont payé.
--   * use_parchemin_griot consomme une charge ; le chat des Loups reste lisible toute la partie une fois activé (can_read_channel
--     regarde game_artifact_uses, pas le stock).
--   * Vue de partie : `my_owns_parchemin_griot` = il reste une charge, ou on l'a activé dans cette partie ; nouveau champ
--     `my_parchemin_griot_stock`.
-- À appliquer APRÈS 0246. Rejouable sans risque.
set search_path = public;

do $$
begin
  -- Garde de rejeu : la conversion n'a lieu que tant que l'artefact n'est pas encore à stock, sinon relancer la migration
  -- redonnerait un stock plein à ceux qui ont déjà consommé leurs charges.
  if exists (select 1 from public.store_artifacts where effect_key = 'parchemin_griot' and max_stock is null) then
    update public.store_artifacts
    set category = 'rares',
        rarity = 'commun',
        max_stock = public.artifact_stock_cap('commun'),
        repurchase_cooldown_hours = 0
    where effect_key = 'parchemin_griot';

    update public.player_artifacts pa
    set quantity = public.artifact_stock_cap('commun')
    from public.store_artifacts sa
    where sa.id = pa.artifact_id and sa.effect_key = 'parchemin_griot';
  end if;
end;
$$;

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
  v_qty int;
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

  select sa.id, pa.quantity into v_artifact_id, v_qty
    from public.store_artifacts sa
    join public.player_artifacts pa on pa.artifact_id = sa.id and pa.user_id = v_user
    where sa.effect_key = 'parchemin_griot'
    for update of pa;

  if v_artifact_id is null or v_qty < 1 then
    raise exception 'Vous n''avez plus de Parchemin du Griot en réserve.';
  end if;

  if exists (
    select 1 from public.game_artifact_uses
    where game_id = p_game_id and user_id = v_user and artifact_id = v_artifact_id
  ) then
    raise exception 'Déjà activé dans cette partie.';
  end if;

  update public.player_artifacts set quantity = quantity - 1
    where user_id = v_user and artifact_id = v_artifact_id;
  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);
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
