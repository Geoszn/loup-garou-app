-- 0255 — Boussole du Village, Balance de l'Ange, Feu Sacré des Ancêtres et Masque du Sans-Visage passent au système de stock
-- par rareté (voir 0246 à 0248).
--
--   * Conversion (une seule fois par artefact, rejouable sans effet) : tout artefact de ces quatre effets pas encore à stock
--     passe en catégorie « rares », stock maximum selon sa rareté (déjà posée par 0246 : rare = 3, épique = 2), rachat immédiat.
--     Prix, nom, description et état actif sont conservés. Ceux qui le possédaient à vie reçoivent un stock plein.
--   * Balance de l'Ange et Feu Sacré se déclenchent d'eux-mêmes : une charge part au déclenchement réel
--     (resolve_day_vote_deaths, submit_balance_ange_vote). Sans charge, ils ne se déclenchent plus.
--   * Masque du Sans-Visage (passif) : une charge part quand la Voyante sonde pour la première fois, dans une partie, un LOUP qui
--     porte le Masque (déclencheur sur night_actions). Sonder un villageois ne coûte rien. Une fois la charge consommée, le Masque
--     couvre le porteur pour tous les sondages suivants de cette partie (game_artifact_uses, une ligne par partie).
--     Limite connue : si la Voyante change de cible dans la même étape de nuit, la charge déjà consommée n'est pas rendue.
--   * Boussole du Village (passive) : nouvelle activation explicite use_boussole_village (bouton dans « Mes artefacts »), une
--     charge par partie ; l'historique des votes n'est visible qu'une fois activée. Nouveaux champs de vue de partie
--     my_boussole_village_stock et my_boussole_village_used.
--   * Les bots de test ne possèdent pas ces artefacts : leur chemin automatique (_auto_play_bots_core) n'est pas modifié.
-- À appliquer APRÈS 0254. Rejouable sans risque.
set search_path = public;

do $$
declare
  v_key text;
  v_ids uuid[];
begin
  foreach v_key in array array['boussole_village', 'balance_ange', 'feu_sacre_ancetres', 'masque_sans_visage'] loop
    -- Garde de rejeu : une fois converti (max_stock renseigné), l'artefact n'est plus sélectionné, donc relancer la migration
    -- ne redonne pas de charges à ceux qui les ont déjà consommées.
    select array_agg(id) into v_ids
    from public.store_artifacts
    where effect_key = v_key and max_stock is null;

    if v_ids is not null then
      update public.store_artifacts
      set category = 'rares',
          max_stock = public.artifact_stock_cap(rarity),
          repurchase_cooldown_hours = 0
      where id = any (v_ids);

      update public.player_artifacts pa
      set quantity = public.artifact_stock_cap(sa.rarity)
      from public.store_artifacts sa
      where sa.id = pa.artifact_id and pa.artifact_id = any (v_ids);
    end if;
  end loop;
end;
$$;

-- Feu Sacré (resolve_day_vote_deaths) et Balance de l'Ange : définitions recopiées de 0152 et 0177, avec le filtre « il reste une
-- charge » et la consommation.

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
  v_tied_ids uuid[];
  v_balance_owner uuid;
  v_feu_sacre_artifact_id uuid;
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
      -- Balance de l'Ange (migration 0152) : avant de conclure "personne
      -- n'est éliminé", cherche un joueur vivant qui possède cet artefact
      -- et ne l'a pas encore utilisé cette partie — il obtient alors un
      -- vote décisif personnel pour départager l'égalité (pending-action,
      -- voir advance_phase/submit_balance_ange_vote), au lieu de la
      -- résolution automatique habituelle.
      select array_agg(t.target_id) into v_tied_ids
      from (
        select v.target_id, sum(case when v.voter_id = v_captain_id then 2 else 1 end) as c
        from public.votes v
        where v.game_id = p_game_id and v.round_number = v_round and v.target_id is not null
        group by v.target_id
        having sum(case when v.voter_id = v_captain_id then 2 else 1 end) = v_top.votes
      ) t;

      select pa.user_id into v_balance_owner
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      join public.game_players gp on gp.user_id = pa.user_id and gp.game_id = p_game_id and gp.is_alive
      where sa.effect_key = 'balance_ange'
        and pa.quantity > 0
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = pa.user_id and gau.artifact_id = pa.artifact_id
        )
      order by gp.seat_number
      limit 1;

      if v_balance_owner is not null then
        update public.games
        set balance_ange_pending = v_balance_owner, balance_ange_candidates = v_tied_ids
        where id = p_game_id;
        insert into public.game_log (game_id, message)
        values (p_game_id, '⚖️ Égalité des voix : la Balance de l’Ange va départager le vote...');
      else
        insert into public.game_log (game_id, message)
        values (p_game_id, '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.');
      end if;
    else
      -- Feu Sacré des Ancêtres (migration 0152) : bloque cette élimination
      -- précise une fois par partie, annoncé de façon anonyme (même
      -- principe que la potion de guérison de la Sorcière, resolve_night_deaths)
      -- — personne ne meurt à la place.
      select pa.artifact_id into v_feu_sacre_artifact_id
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = v_top.target_id and sa.effect_key = 'feu_sacre_ancetres'
        and pa.quantity > 0
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = v_top.target_id and gau.artifact_id = pa.artifact_id
        )
      limit 1;

      if v_feu_sacre_artifact_id is not null then
        insert into public.game_artifact_uses (game_id, user_id, artifact_id, round_number)
        values (p_game_id, v_top.target_id, v_feu_sacre_artifact_id, v_round);
        -- Charge consommée (migration 0255) : le Feu Sacré fonctionne par stock.
        update public.player_artifacts set quantity = quantity - 1
          where user_id = v_top.target_id and artifact_id = v_feu_sacre_artifact_id;

        insert into public.game_log (game_id, message)
        values (p_game_id, '🔥 Un feu sacré a protégé quelqu''un du bûcher aujourd''hui.');
      else
        perform public.kill_player(p_game_id, v_top.target_id, 'vote', v_round);
      end if;
    end if;
  end if;

  update public.games set day_vote_resolved = true where id = p_game_id;
end;
$$;

create or replace function public.submit_balance_ange_vote(p_game_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_artifact_id uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status = 'ended' or v_game.balance_ange_pending is distinct from v_user then
    raise exception 'Ce n''est pas à vous de départager ce vote.';
  end if;

  if p_target_id is null or not (p_target_id = any(coalesce(v_game.balance_ange_candidates, '{}'::uuid[]))) then
    raise exception 'Cible invalide : doit faire partie des joueurs à égalité.';
  end if;
  if p_target_id = v_user then
    raise exception 'Vous ne pouvez pas vous désigner vous-même.';
  end if;

  select pa.artifact_id into v_artifact_id
  from public.player_artifacts pa
  join public.store_artifacts sa on sa.id = pa.artifact_id
  where pa.user_id = v_user and sa.effect_key = 'balance_ange'
    and pa.quantity > 0
    and not exists (
      select 1 from public.game_artifact_uses gau
      where gau.game_id = p_game_id and gau.user_id = v_user and gau.artifact_id = pa.artifact_id
    )
  limit 1;

  if v_artifact_id is null then
    raise exception 'Vous ne possédez pas cet artefact (ou déjà utilisé).';
  end if;

  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);
  -- Charge consommée (migration 0255) : la Balance de l'Ange fonctionne par stock.
  update public.player_artifacts set quantity = quantity - 1 where user_id = v_user and artifact_id = v_artifact_id;

  update public.games set balance_ange_pending = null, balance_ange_candidates = null where id = p_game_id;

  perform public.kill_player(p_game_id, p_target_id, 'vote', v_game.night_number);

  insert into public.game_log (game_id, message)
  values (p_game_id, '⚖️ La Balance de l’Ange a départagé le vote.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_balance_ange_vote(uuid, uuid) to authenticated;

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

    -- Boussole du Village (migration 0255) : par charges. L'historique n'est visible qu'une fois la Boussole activée dans
    -- CETTE partie (game_artifact_uses), pas par simple possession.
    'my_boussole_village_stock', coalesce((
      select pa.quantity from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'boussole_village'
    ), 0),

    'my_boussole_village_used', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'boussole_village'
    ),

    'vote_history', case when exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'boussole_village'
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

create or replace function public.game_view_seer_griot_fields(
  p_game_id uuid, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'seer_reveals', case when p_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', case
          -- Masque du Sans-Visage (migration 0255) : par charges. Il couvre le porteur une fois sa charge consommée dans
          -- CETTE partie (déclencheur sur night_actions, au premier sondage d'un loup porteur).
          when exists (
            select 1 from public.game_artifact_uses gau
            join public.store_artifacts sa on sa.id = gau.artifact_id
            where gau.game_id = na.game_id and gau.user_id = na.target_id and sa.effect_key = 'masque_sans_visage'
          ) then 'villageois'
          -- Manteau de la Meute (Reine Louve, migration 0242) : un loup couvert CETTE nuit-là apparaît comme villageois.
          when exists (
            select 1 from public.night_actions q
            where q.game_id = na.game_id and q.step = 'reine_louve'
              and q.night_number = na.night_number and q.target_id = na.target_id
          ) then 'villageois'
          when rs.role in ('loup_garou', 'loup_alpha', 'grand_mechant_loup', 'reine_louve') then 'loup_garou'
          else 'villageois'
        end,
        'night_number', na.night_number
      ) order by na.night_number)
      from public.night_actions na
      join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
      where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = p_user
    ), '[]'::jsonb) else null end,

    'griot_reveals', case when p_my_role = 'griot' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'night_number', na.night_number,
        'kind', public.compute_griot_phrase(p_game_id, na.target_id, na.night_number - 1)
      ) order by na.night_number)
      from public.night_actions na
      where na.game_id = p_game_id and na.step = 'griot' and na.actor_id = p_user
    ), '[]'::jsonb) else null end
  );
$$;

-- Boussole du Village : activation explicite, une charge par partie.
create or replace function public.use_boussole_village(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_artifact_id uuid;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null or v_status in ('lobby', 'ended') then
    raise exception 'La partie n''est pas en cours.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select sa.id into v_artifact_id
    from public.store_artifacts sa
    join public.player_artifacts pa on pa.artifact_id = sa.id and pa.user_id = v_user
    where sa.effect_key = 'boussole_village'
      and pa.quantity > 0
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = p_game_id and gau.user_id = v_user and gau.artifact_id = sa.id
      )
    limit 1
    for update of pa;

  if v_artifact_id is null then
    raise exception 'Vous n''avez plus de charge de Boussole du Village, ou vous l''avez déjà activée cette partie.';
  end if;

  update public.player_artifacts set quantity = quantity - 1 where user_id = v_user and artifact_id = v_artifact_id;
  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);
end;
$$;

revoke execute on function public.use_boussole_village(uuid) from public, anon;
grant execute on function public.use_boussole_village(uuid) to authenticated;

-- Masque du Sans-Visage : consomme une charge au premier sondage d'un loup porteur dans la partie.
create or replace function public.consume_masque_sans_visage_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_artifact_id uuid;
begin
  if NEW.step <> 'voyante' or NEW.target_id is null then
    return null;
  end if;

  select role into v_role from public.game_roles_secret where game_id = NEW.game_id and user_id = NEW.target_id;
  -- Mêmes rôles que la lecture de la Voyante (game_view_seer_griot_fields) : le Masque ne coûte rien s'il ne cache aucun loup.
  if v_role is null or v_role not in ('loup_garou', 'loup_alpha', 'grand_mechant_loup', 'reine_louve') then
    return null;
  end if;

  select pa.artifact_id into v_artifact_id
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = NEW.target_id and sa.effect_key = 'masque_sans_visage'
      and pa.quantity > 0
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = NEW.game_id and gau.user_id = NEW.target_id and gau.artifact_id = pa.artifact_id
      )
    limit 1
    for update of pa;

  if v_artifact_id is null then
    return null;
  end if;

  insert into public.game_artifact_uses (game_id, user_id, artifact_id, round_number)
  values (NEW.game_id, NEW.target_id, v_artifact_id, NEW.night_number)
  on conflict do nothing;
  update public.player_artifacts set quantity = quantity - 1 where user_id = NEW.target_id and artifact_id = v_artifact_id;
  return null;
end;
$$;

revoke all on function public.consume_masque_sans_visage_charge() from public, anon, authenticated;

drop trigger if exists trg_consume_masque_charge on public.night_actions;
create trigger trg_consume_masque_charge
  after insert or update of target_id on public.night_actions
  for each row
  when (NEW.step = 'voyante')
  execute function public.consume_masque_sans_visage_charge();
