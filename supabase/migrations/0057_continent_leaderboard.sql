-- ============================================================================
-- Remplace le classement par pays (migration 0055) par un classement par
-- continent. Avec ~74 pays possibles dans l'ancienne liste, un seul joueur
-- suffisait à devenir "1er de son pays" sans rien avoir prouvé — le
-- continent (6 valeurs) regroupe assez de monde pour que le classement ait
-- un sens, et reste trivial à choisir dans un sélecteur ou une pop-up.
--
-- On abandonne complètement le pays (colonne + fonction dédiées, liste de
-- 74 pays/drapeaux côté client) au profit du continent, sur demande
-- explicite : une seule question posée au joueur, plus simple à maintenir
-- des deux côtés.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- Colonne continent (remplace country)
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists continent text;

alter table public.profiles drop constraint if exists profiles_continent_check;
alter table public.profiles add constraint profiles_continent_check
  check (continent is null or continent in ('afrique','europe','amerique_nord','amerique_sud','asie','oceanie'));

-- Supprime complètement le pays : plus de colonne, plus de fonction dédiée.
-- drop column entraîne automatiquement la suppression de profiles_country_check.
alter table public.profiles drop column if exists country;
drop function if exists public.update_my_country(text);

-- ----------------------------------------------------------------------------
-- update_my_continent : choix du continent depuis "Mon compte" ou la pop-up
-- ContinentPrompt (comptes créés avant cette migration).
-- ----------------------------------------------------------------------------
create or replace function public.update_my_continent(p_continent text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_continent text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  v_continent := nullif(trim(p_continent), '');
  if v_continent is not null and v_continent not in ('afrique','europe','amerique_nord','amerique_sud','asie','oceanie') then
    raise exception 'Continent invalide.';
  end if;

  update public.profiles
  set continent = v_continent
  where id = v_user;

  return jsonb_build_object('continent', v_continent);
end;
$$;

grant execute on function public.update_my_continent(text) to authenticated;

-- ----------------------------------------------------------------------------
-- handle_new_user : reprise (voir 0040_lang_preference_and_more_avatars.sql)
-- pour lire aussi le continent choisi à l'inscription (SignUp.tsx l'envoie
-- désormais dans les métadonnées, comme la langue) — reste null si
-- absent/invalide plutôt que de faire échouer l'inscription, le joueur
-- pourra toujours le choisir ensuite via la pop-up ou "Mon compte".
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, lang, continent)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'lang' in ('fr', 'en') then new.raw_user_meta_data ->> 'lang'
      else 'fr'
    end,
    case
      when new.raw_user_meta_data ->> 'continent' in ('afrique','europe','amerique_nord','amerique_sud','asie','oceanie')
        then new.raw_user_meta_data ->> 'continent'
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_public_leaderboard : classement mondial ou continental. En plus du
-- seuil de 3 parties jouées par joueur (déjà en place), on exige au moins 3
-- joueurs éligibles sur le continent avant d'afficher quoi que ce soit —
-- sinon un classement "continental" à 1 ou 2 joueurs reproduirait exactement
-- le problème qu'on cherche à éviter en abandonnant le pays.
-- ----------------------------------------------------------------------------
-- Postgres refuse de renommer un paramètre via CREATE OR REPLACE (p_country
-- -> p_continent) : il faut d'abord supprimer explicitement l'ancienne
-- fonction.
drop function if exists public.get_public_leaderboard(text, text, int);

create or replace function public.get_public_leaderboard(p_scope text default 'global', p_continent text default null, p_limit int default 10)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with eligible as (
    select
      p.id as user_id,
      p.username,
      p.avatar_icon,
      p.continent,
      p.rank_points,
      public.rank_tier_for_points(p.rank_points) as tier,
      p.current_streak,
      p.best_streak,
      p.rank_wins,
      p.rank_games_played
    from public.profiles p
    where p.rank_games_played >= 3
      and (p_scope <> 'continent' or (p_continent is not null and p.continent = p_continent))
  ),
  ranked as (
    select * from eligible
    order by rank_points desc, best_streak desc
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
  )
  select case
    when p_scope = 'continent' and (select count(*) from eligible) < 3 then '[]'::jsonb
    else coalesce((select jsonb_agg(row_to_json(ranked)) from ranked), '[]'::jsonb)
  end;
$$;

grant execute on function public.get_public_leaderboard(text, text, int) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- get_my_stats : remplace pays/position nationale par continent/position
-- continentale (même règle des 3 joueurs minimum pour la position, sinon
-- elle n'aurait pas plus de sens que l'ancienne position "nationale").
-- ----------------------------------------------------------------------------
create or replace function public.get_my_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
  v_rank jsonb;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select jsonb_build_object(
    'rank_points', p.rank_points,
    'rank_tier', public.rank_tier_for_points(p.rank_points),
    'current_streak', p.current_streak,
    'best_streak', p.best_streak,
    'continent', p.continent,
    'global_position', (
      select count(*) + 1 from public.profiles o
      where o.rank_games_played >= 3 and o.rank_points > p.rank_points
    ),
    'continent_position', case
      when p.continent is null then null
      when (
        select count(*) from public.profiles o
        where o.rank_games_played >= 3 and o.continent = p.continent
      ) < 3 then null
      else (
        select count(*) + 1 from public.profiles o
        where o.rank_games_played >= 3 and o.continent = p.continent and o.rank_points > p.rank_points
      )
    end
  ) into v_rank
  from public.profiles p
  where p.id = v_user;

  with my_games as (
    select
      g.id as game_id,
      g.code,
      g.winner_team,
      g.created_at,
      gp.is_lover,
      rs.role
    from public.game_players gp
    join public.games g on g.id = gp.game_id and g.status = 'ended'
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.user_id = v_user
  ),
  scored as (
    select
      *,
      case
        when winner_team = 'amoureux' then is_lover
        when winner_team = 'loups' then role = 'loup_garou'
        when winner_team = 'village' then coalesce(role <> 'loup_garou', true)
        else false
      end as won
    from my_games
  )
  select jsonb_build_object(
    'games_played', (select count(*) from scored),
    'games_won', (select count(*) filter (where won) from scored),
    'rank', v_rank,
    'by_role', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', role,
        'played', played,
        'won', won_count
      ) order by played desc)
      from (
        select role, count(*) as played, count(*) filter (where won) as won_count
        from scored
        where role is not null
        group by role
      ) r
    ), '[]'::jsonb),
    'recent_games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_id', game_id,
        'code', code,
        'winner_team', winner_team,
        'role', role,
        'won', won,
        'created_at', created_at
      ) order by created_at desc)
      from (select * from scored order by created_at desc limit 20) recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_my_stats() to authenticated;
