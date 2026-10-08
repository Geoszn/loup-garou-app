-- « Pronostic des fantômes » : les joueurs ÉLIMINÉS peuvent, s'ils le veulent,
-- miser quelques Loup Coins sur l'issue de la partie. Deux types :
--   * camp      : quel camp va gagner (village / loups / autre) ;
--   * survivor  : un joueur encore en vie sera-t-il toujours en vie à la fin ?
-- Un pronostic de chaque type par joueur et par partie. Facultatif, petit,
-- et sans effet sur la partie ni sur le classement.
--
-- Règles (décidées avec l'utilisateur) :
--  * mises 5 / 10 / 25 / 50 ; la mise est retirée du solde au dépôt (séquestre) ;
--  * cotes FIXES, figées au dépôt, calculées par le serveur à partir du seul
--    effectif visible de tous (survivants, loups restants) avec ~10 % de marge
--    pour la maison : en moyenne les pronostics retirent un peu de pièces ;
--  * troisième issue toujours proposée, « autre » (amoureux, solitaires), pour
--    ne jamais révéler qu'un couple ou un rôle neutre existe ;
--  * pas de pronostic dans les parties avec bots ou à moins de 6 humains, ni
--    quand l'issue est déjà trop évidente (moins de 4 survivants, camp > 80 %) ;
--  * plafond de gain net : 150 pièces par 24 h ;
--  * règlement AUTOMATIQUE à la fin de la partie (déclencheur sur games) ;
--    remboursement si la partie est fermée sans vainqueur, si le joueur est
--    ramené à la vie, si la partie redémarre ou est supprimée.
-- Rejouable sans risque (create ... if not exists / create or replace).
set search_path = public;

create table if not exists public.ghost_bets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('camp', 'survivor')),
  pick text not null,
  stake int not null check (stake in (5, 10, 25, 50)),
  odds numeric(4, 1) not null check (odds >= 1.0),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  result text check (result in ('won', 'lost', 'refunded')),
  payout int not null default 0,
  unique (game_id, user_id, kind)
);

create index if not exists ghost_bets_game_idx on public.ghost_bets (game_id);
create index if not exists ghost_bets_user_settled_idx on public.ghost_bets (user_id, settled_at);

alter table public.ghost_bets enable row level security;
revoke all on public.ghost_bets from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Cotes : n'utilise que ce que tout le monde voit (survivants, loups restants
-- — le panneau « Effectifs » affiche déjà ce nombre à tous).
-- ----------------------------------------------------------------------------
create or replace function public.ghost_bet_market(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_total int;
  v_n int;
  v_bots int;
  v_w int;
  v_x numeric;
  v_pw numeric;
  v_pv numeric;
  v_pl numeric;
  v_po constant numeric := 0.12;
  v_psurv numeric;
  v_open boolean := true;
  v_reason text := null;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('open', false, 'reason', 'game');
  end if;

  select count(*), count(*) filter (where is_alive) into v_total, v_n
  from public.game_players where game_id = p_game_id;
  select count(*) into v_bots
  from public.game_players gp join public.profiles p on p.id = gp.user_id
  where gp.game_id = p_game_id and p.is_bot;

  select count(*) into v_w
  from public.game_roles_secret r
  join public.game_players gp on gp.game_id = r.game_id and gp.user_id = r.user_id
  where r.game_id = p_game_id and gp.is_alive
    and r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup');

  v_x := v_w::numeric / greatest(v_n - v_w, 1);
  v_pw := case when v_x <= 0 then 0.04
               else power(v_x, 1.8) / (power(v_x, 1.8) + power(1.0 / 3.0, 1.8)) end;
  v_pw := least(0.96, greatest(0.04, v_pw));
  v_pl := (1 - v_po) * v_pw;
  v_pv := (1 - v_po) * (1 - v_pw);
  v_psurv := least(0.9, (2.5 + 0.12 * v_n) / greatest(v_n, 1));

  if v_game.status not in ('night', 'day_reveal', 'day_discussion', 'day_vote') then
    v_open := false; v_reason := 'status';
  elsif v_bots > 0 then
    v_open := false; v_reason := 'bots';
  elsif v_total - v_bots < 6 then
    v_open := false; v_reason := 'too_few';
  elsif v_n <= 3 or v_w = 0 or v_w * 2 >= v_n or greatest(v_pv, v_pl) > 0.8 then
    v_open := false; v_reason := 'decided';
  end if;

  return jsonb_build_object(
    'open', v_open,
    'reason', v_reason,
    'alive', v_n,
    'odds', jsonb_build_object(
      'village', round(greatest(1.1, least(8, 0.9 / v_pv))::numeric, 1),
      'loups', round(greatest(1.1, least(8, 0.9 / v_pl))::numeric, 1),
      'autre', round(greatest(1.1, least(8, 0.9 / v_po))::numeric, 1)
    ),
    'survivor_odds', round(greatest(1.2, least(12, 0.9 / v_psurv))::numeric, 1)
  );
end;
$$;

revoke execute on function public.ghost_bet_market(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Mouvements de pièces (internes, jamais appelés par le client).
-- ----------------------------------------------------------------------------
create or replace function public.ghost_bet_credit(p_user uuid, p_amount int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set loup_coins = loup_coins + p_amount where id = p_user;
  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (p_user, p_amount, p_reason, null);
end;
$$;

revoke execute on function public.ghost_bet_credit(uuid, int, text) from public, anon, authenticated;

-- Rembourse (et clôt) les pronostics non réglés d'une partie, éventuellement
-- d'un seul joueur.
create or replace function public.ghost_bet_refund(p_game_id uuid, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.ghost_bets%rowtype;
begin
  for b in
    select * from public.ghost_bets
    where game_id = p_game_id and settled_at is null and (p_user is null or user_id = p_user)
    for update
  loop
    perform public.ghost_bet_credit(b.user_id, b.stake, 'ghost_bet_refund');
    update public.ghost_bets set settled_at = now(), result = 'refunded', payout = b.stake where id = b.id;
  end loop;
end;
$$;

revoke execute on function public.ghost_bet_refund(uuid, uuid) from public, anon, authenticated;

-- Règle les pronostics à la fin de la partie. winner null ou « closed » (fermée
-- sans vainqueur, par ex. après 2 h d'inactivité) : tout le monde est remboursé.
create or replace function public.ghost_bet_settle(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.ghost_bets%rowtype;
  v_camp text;
  v_won boolean;
  v_payout int;
begin
  if p_winner is null or p_winner = 'closed' then
    perform public.ghost_bet_refund(p_game_id);
    return;
  end if;

  v_camp := case p_winner when 'village' then 'village' when 'loups' then 'loups' else 'autre' end;

  for b in
    select * from public.ghost_bets where game_id = p_game_id and settled_at is null for update
  loop
    if b.kind = 'camp' then
      v_won := (b.pick = v_camp);
    else
      v_won := exists (
        select 1 from public.game_players
        where game_id = p_game_id and user_id::text = b.pick and is_alive
      );
    end if;

    if v_won then
      v_payout := floor(b.stake * b.odds)::int;
      perform public.ghost_bet_credit(b.user_id, v_payout, 'ghost_bet_win');
      update public.ghost_bets set settled_at = now(), result = 'won', payout = v_payout where id = b.id;
    else
      update public.ghost_bets set settled_at = now(), result = 'lost', payout = 0 where id = b.id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.ghost_bet_settle(uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Déclencheurs : on n'ajoute rien aux fonctions du moteur de jeu.
-- ----------------------------------------------------------------------------
create or replace function public.ghost_bets_on_game_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ended' then
    perform public.ghost_bet_settle(new.id, new.winner_team);
  elsif new.status = 'lobby' then
    -- Redémarrage de la partie (même game_id) : rembourse ce qui restait, puis
    -- repart d'une page blanche.
    perform public.ghost_bet_refund(new.id);
    delete from public.ghost_bets where game_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists ghost_bets_game_change on public.games;
create trigger ghost_bets_game_change
  after update of status on public.games
  for each row
  when (old.status is distinct from new.status)
  execute function public.ghost_bets_on_game_change();

create or replace function public.ghost_bets_on_game_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ghost_bet_refund(old.id);
  return old;
end;
$$;

drop trigger if exists ghost_bets_game_delete on public.games;
create trigger ghost_bets_game_delete
  before delete on public.games
  for each row
  execute function public.ghost_bets_on_game_delete();

-- Un joueur ramené à la vie (Pierre des Ancêtres, Larme de Renaissance…) peut
-- de nouveau influencer la partie : ses pronostics sont annulés et remboursés.
create or replace function public.ghost_bets_on_revive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ghost_bet_refund(new.game_id, new.user_id);
  return new;
end;
$$;

drop trigger if exists ghost_bets_revive on public.game_players;
create trigger ghost_bets_revive
  after update of is_alive on public.game_players
  for each row
  when (old.is_alive = false and new.is_alive = true)
  execute function public.ghost_bets_on_revive();

-- ----------------------------------------------------------------------------
-- RPC client : l'état du pronostic pour la partie, et le dépôt d'un pronostic.
-- ----------------------------------------------------------------------------
create or replace function public.get_ghost_bet_state(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_gp public.game_players%rowtype;
  v_market jsonb;
  v_reason text;
  v_net int;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into v_gp from public.game_players where game_id = p_game_id and user_id = v_user;
  if not found then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  v_market := public.ghost_bet_market(p_game_id);

  select coalesce(sum(payout - stake), 0)::int into v_net
  from public.ghost_bets
  where user_id = v_user and result in ('won', 'lost') and settled_at > now() - interval '24 hours';

  v_reason := case
    when v_gp.is_alive then 'not_dead'
    when v_gp.is_banned or v_gp.death_cause in ('parti', 'exclu') then 'left'
    when v_gp.pending_revival then 'revival_pending'
    when not (v_market ->> 'open')::boolean then v_market ->> 'reason'
    when v_net >= 150 then 'daily_cap'
    else null
  end;

  return jsonb_build_object(
    'can_bet', v_reason is null,
    'reason', v_reason,
    'market', v_market,
    'balance', (select loup_coins from public.profiles where id = v_user),
    'net_24h', v_net,
    'daily_cap', 150,
    'my_bets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', kind, 'pick', pick, 'stake', stake, 'odds', odds, 'result', result, 'payout', payout
      ) order by created_at)
      from public.ghost_bets where game_id = p_game_id and user_id = v_user
    ), '[]'::jsonb),
    'ghosts', jsonb_build_object(
      'village', (select count(*) from public.ghost_bets where game_id = p_game_id and kind = 'camp' and pick = 'village'),
      'loups', (select count(*) from public.ghost_bets where game_id = p_game_id and kind = 'camp' and pick = 'loups'),
      'autre', (select count(*) from public.ghost_bets where game_id = p_game_id and kind = 'camp' and pick = 'autre')
    )
  );
end;
$$;

revoke execute on function public.get_ghost_bet_state(uuid) from public, anon;
grant execute on function public.get_ghost_bet_state(uuid) to authenticated;

create or replace function public.place_ghost_bet(p_game_id uuid, p_kind text, p_pick text, p_stake int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_state jsonb;
  v_market jsonb;
  v_odds numeric;
  v_target uuid;
  v_balance bigint;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_kind not in ('camp', 'survivor') then
    raise exception 'Pronostic invalide.';
  end if;
  if p_stake not in (5, 10, 25, 50) then
    raise exception 'Mise invalide.';
  end if;

  -- Verrou sur la partie : deux dépôts simultanés ne se marchent pas dessus.
  perform 1 from public.games where id = p_game_id for share;

  v_state := public.get_ghost_bet_state(p_game_id);
  if not (v_state ->> 'can_bet')::boolean then
    raise exception 'Les pronostics ne sont pas disponibles pour vous en ce moment.';
  end if;
  v_market := v_state -> 'market';

  if p_kind = 'camp' then
    if p_pick not in ('village', 'loups', 'autre') then
      raise exception 'Pronostic invalide.';
    end if;
    v_odds := (v_market -> 'odds' ->> p_pick)::numeric;
  else
    begin
      v_target := p_pick::uuid;
    exception when others then
      raise exception 'Pronostic invalide.';
    end;
    if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_target and is_alive) then
      raise exception 'Ce joueur n''est plus en vie.';
    end if;
    v_odds := (v_market ->> 'survivor_odds')::numeric;
  end if;

  if exists (select 1 from public.ghost_bets where game_id = p_game_id and user_id = v_user and kind = p_kind) then
    raise exception 'Vous avez déjà fait ce pronostic.';
  end if;

  select loup_coins into v_balance from public.profiles where id = v_user for update;
  if coalesce(v_balance, 0) < p_stake then
    raise exception 'Solde de Loup Coins insuffisant.';
  end if;

  insert into public.ghost_bets (game_id, user_id, kind, pick, stake, odds)
  values (p_game_id, v_user, p_kind, case when p_kind = 'survivor' then v_target::text else p_pick end, p_stake, v_odds);

  perform public.ghost_bet_credit(v_user, -p_stake, 'ghost_bet_stake');

  return public.get_ghost_bet_state(p_game_id);
end;
$$;

revoke execute on function public.place_ghost_bet(uuid, text, text, int) from public, anon;
grant execute on function public.place_ghost_bet(uuid, text, text, int) to authenticated;
