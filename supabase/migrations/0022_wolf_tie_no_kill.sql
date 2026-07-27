-- ----------------------------------------------------------------------------
-- 0022_wolf_tie_no_kill : en cas d'égalité de votes chez les Loups-Garous,
-- personne n'est dévoré cette nuit (au lieu de trancher au hasard).
--
-- get_wolf_target (0004_game_engine.sql) faisait :
--   order by count(*) desc, random() limit 1
-- ce qui choisissait bien "personne" quand aucun loup ne vote (0 ligne), mais
-- en cas d'égalité entre deux cibles ou plus, le "random()" du ORDER BY
-- tranchait quand même et produisait une victime au hasard. On corrige pour
-- ne renvoyer une cible que si elle est seule en tête du vote ; sinon (0 vote
-- OU égalité), la fonction renvoie NULL et resolve_night_deaths (inchangée)
-- traite déjà correctement ce cas comme "personne n'est mort cette nuit".
-- ----------------------------------------------------------------------------
create or replace function public.get_wolf_target(p_game_id uuid, p_night int)
returns uuid
language sql
security definer
set search_path = public
as $$
  with tally as (
    select target_id, count(*) as votes
    from public.night_actions
    where game_id = p_game_id and night_number = p_night and step = 'loup_garou' and target_id is not null
    group by target_id
  ),
  top as (
    select target_id
    from tally
    where votes = (select max(votes) from tally)
  )
  select target_id from top
  where (select count(*) from top) = 1;
$$;
