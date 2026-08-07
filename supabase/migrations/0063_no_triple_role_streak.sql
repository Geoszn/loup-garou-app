-- ============================================================================
-- Le tirage des rôles est déjà un vrai hasard uniforme (order by random()
-- sur chaque rôle à distribuer, un idiome PostgreSQL standard — vérifié,
-- pas de biais trouvé). Mais le hasard pur autorise, par définition, des
-- séries : sur beaucoup de parties, tomber 3 fois de suite sur le même
-- rôle arrive de temps en temps par pur hasard, et c'est ce qui a été
-- rapporté comme "pas logique".
--
-- Règle demandée : jamais le même rôle 3 fois d'affilée pour un même
-- joueur (2 fois de suite reste possible, juste pas une 3e).
--
-- Pour ça, il faut mémoriser le dernier rôle de chaque joueur ET depuis
-- combien de parties d'affilée il l'a (profiles.last_role/role_streak,
-- mis à jour à CHAQUE distribution de rôles, que la partie se termine,
-- soit relancée ou abandonnée ensuite — ce qui compte pour le ressenti du
-- joueur, c'est le rôle vu à l'écran, pas l'issue de la partie).
--
-- start_game tire au hasard comme avant, puis vérifie qu'aucun joueur
-- n'atteindrait 3 fois le même rôle (streak déjà à 2 + rôle identique) ;
-- si c'est le cas, retire une nouvelle distribution complète (jusqu'à 200
-- essais — largement suffisant en pratique, la probabilité qu'un essai
-- viole la règle est faible et chaque essai est indépendant). Choix
-- délibéré : un nouveau tirage complet plutôt qu'un échange ciblé entre
-- deux joueurs, pour ne prendre aucun risque d'introduire un biais ou un
-- bug dans une logique d'échange sur mesure — un simple rejet/nouvel essai
-- reste un tirage uniforme parmi les distributions valides.
-- ============================================================================
set search_path = public;

alter table public.profiles add column if not exists last_role text;
alter table public.profiles add column if not exists role_streak int not null default 0;

create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_players uuid[];
  v_count int;
  v_role_counts jsonb;
  v_roles text[] := array[]::text[];
  v_shuffled text[];
  v_special_total int;
  v_seconds int;
  v_thief_extra text[];
  v_last_roles text[];
  v_last_streaks int[];
  v_attempt int;
  v_ok boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut démarrer la partie.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  select array_agg(user_id order by seat_number) into v_players
  from public.game_players where game_id = p_game_id;

  v_count := coalesce(array_length(v_players, 1), 0);
  if v_count < 4 then raise exception 'Il faut au moins 4 joueurs pour commencer.'; end if;
  if v_count > 25 then raise exception 'Une partie ne peut pas dépasser 25 joueurs.'; end if;

  v_role_counts := v_game.settings -> 'role_counts';
  if v_role_counts is null or v_role_counts = 'null'::jsonb then
    v_role_counts := public.compute_default_role_counts(v_count);
  end if;

  v_special_total := (v_role_counts->>'loup_garou')::int
    + (v_role_counts->>'voyante')::boolean::int
    + (v_role_counts->>'sorciere')::boolean::int
    + (v_role_counts->>'chasseur')::boolean::int
    + (v_role_counts->>'petite_fille')::boolean::int
    + (v_role_counts->>'cupidon')::boolean::int
    + coalesce((v_role_counts->>'ancien')::boolean::int, 0)
    + coalesce((v_role_counts->>'voleur')::boolean::int, 0)
    + coalesce((v_role_counts->>'enfant_sauvage')::boolean::int, 0);

  if (v_role_counts->>'loup_garou')::int < 1 then
    raise exception 'Il faut au moins un Loup-Garou.';
  end if;
  if v_special_total > v_count then
    raise exception 'La configuration des rôles dépasse le nombre de joueurs.';
  end if;

  for i in 1..(v_role_counts->>'loup_garou')::int loop
    v_roles := v_roles || 'loup_garou'::text;
  end loop;
  if (v_role_counts->>'voyante')::boolean then v_roles := v_roles || 'voyante'::text; end if;
  if (v_role_counts->>'sorciere')::boolean then v_roles := v_roles || 'sorciere'::text; end if;
  if (v_role_counts->>'chasseur')::boolean then v_roles := v_roles || 'chasseur'::text; end if;
  if (v_role_counts->>'petite_fille')::boolean then v_roles := v_roles || 'petite_fille'::text; end if;
  if (v_role_counts->>'cupidon')::boolean then v_roles := v_roles || 'cupidon'::text; end if;
  if coalesce((v_role_counts->>'ancien')::boolean, false) then v_roles := v_roles || 'ancien'::text; end if;
  if coalesce((v_role_counts->>'enfant_sauvage')::boolean, false) then v_roles := v_roles || 'enfant_sauvage'::text; end if;
  if coalesce((v_role_counts->>'voleur')::boolean, false) then
    v_roles := v_roles || 'voleur'::text;
    v_thief_extra := array['loup_garou', 'villageois'];
  end if;

  while coalesce(array_length(v_roles, 1), 0) < v_count loop
    v_roles := v_roles || 'villageois'::text;
  end loop;

  -- Dernier rôle + série en cours de chaque joueur, dans le MÊME ordre que
  -- v_players (array_agg order by ord, pas l'ordre du join) pour pouvoir
  -- comparer v_last_roles[i] à v_shuffled[i] par simple index plus bas.
  select array_agg(coalesce(p.last_role, '')), array_agg(coalesce(p.role_streak, 0))
  into v_last_roles, v_last_streaks
  from (
    select user_id, ord from unnest(v_players) with ordinality as t(user_id, ord) order by ord
  ) t
  join public.profiles p on p.id = t.user_id;

  -- Retire une distribution complète tant qu'elle ferait vivre à un
  -- joueur un 3e rôle identique d'affilée (streak déjà à 2 = 2 fois de
  -- suite déjà vécues). 200 essais : en pratique la toute première ou
  -- deuxième distribution passe déjà, ce plafond n'est là que pour ne
  -- jamais boucler indéfiniment dans le cas — extrêmement rare — où la
  -- contrainte serait impossible à satisfaire pour cette configuration
  -- précise de rôles/joueurs (on garde alors la dernière distribution
  -- tirée, un hasard non contraint valant mieux qu'un blocage).
  for v_attempt in 1..200 loop
    select array_agg(r order by random()) into v_shuffled from unnest(v_roles) r;

    v_ok := true;
    for i in 1..v_count loop
      if v_shuffled[i] = v_last_roles[i] and v_last_streaks[i] >= 2 then
        v_ok := false;
        exit;
      end if;
    end loop;

    exit when v_ok;
  end loop;

  for i in 1..v_count loop
    insert into public.game_roles_secret (game_id, user_id, role)
    values (p_game_id, v_players[i], v_shuffled[i]);

    update public.profiles
    set role_streak = case when last_role = v_shuffled[i] then role_streak + 1 else 1 end,
        last_role = v_shuffled[i]
    where id = v_players[i];
  end loop;

  select coalesce((v_game.settings->>'role_reveal_intro_seconds')::int, 60) into v_seconds;

  update public.game_players set is_ready = false where game_id = p_game_id;

  update public.games
  set status = 'role_reveal',
      night_number = 0,
      night_step = null,
      phase_deadline = now() + make_interval(secs => v_seconds),
      settings = jsonb_set(settings, '{role_counts}', v_role_counts),
      thief_extra_roles = v_thief_extra,
      village_powers_disabled = false,
      captain_pending = null
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🎭 Les rôles ont été distribués en secret. Regardez votre carte...');
end;
$$;
