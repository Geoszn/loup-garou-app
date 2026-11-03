-- 0253 — Numéro de version de l'état d'une partie.
--
-- Problème : pour savoir si l'état d'une partie a changé, chaque client relisait get_my_game_view en entier (l'appel le
-- plus coûteux de l'appli : ~200 ms) toutes les 10 s, plus à chaque évènement Realtime sur games / game_players /
-- game_log (3 abonnements par joueur, chacun avec sa vérification de droits). Et les votes / actions de nuit n'étant pas
-- publiés en Realtime, ils passaient par un détour : une mise à jour de games.last_activity_at (voir 0049).
--
-- Ici : une ligne par partie (game_state_version) dont le numéro augmente à CHAQUE transaction qui modifie une table
-- dont get_my_game_view dépend. Les clients :
--   - s'abonnent à UNE seule table (au lieu de trois) et se rafraîchissent quand le numéro change,
--   - sondent get_game_version (une lecture, ~1 ms) au lieu de la vue complète.
--
-- Choix techniques :
--   - déclencheurs « constraint » DIFFÉRÉS : la mise à jour du numéro se fait au COMMIT, donc toujours en dernier — pas
--     de risque d'inversion de verrous (interblocage) avec advance_phase, qui verrouille games d'abord ;
--   - au plus une mise à jour par partie et par transaction (marqueur local à la transaction) ;
--   - games.last_activity_at seul ne compte pas (touché par le chat, voir 0215) ;
--   - la table est lisible par tout compte connecté : le numéro ne révèle rien, et la politique triviale rend la
--     vérification de droits de Realtime quasi gratuite.
--
-- RETOUR EN ARRIÈRE : les clients précédents l'ignorent. Pour retirer les déclencheurs :
--   drop trigger trg_bump_game_version on public.<table>;   (pour chaque table listée plus bas)
-- Rejouable sans risque.
set search_path = public;

create table if not exists public.game_state_version (
  game_id uuid primary key references public.games (id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.game_state_version enable row level security;
revoke all on table public.game_state_version from anon;
grant select on table public.game_state_version to authenticated;
drop policy if exists game_state_version_select on public.game_state_version;
create policy game_state_version_select on public.game_state_version
  for select to authenticated using (true);

insert into public.game_state_version (game_id)
select id from public.games
on conflict (game_id) do nothing;

create or replace function public.bump_game_state_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game uuid;
  v_key text;
begin
  if TG_TABLE_NAME = 'games' then
    v_game := NEW.id;
  elsif TG_OP = 'DELETE' then
    v_game := OLD.game_id;
  else
    v_game := NEW.game_id;
  end if;
  if v_game is null then
    return null;
  end if;

  -- Une seule mise à jour par partie et par transaction.
  v_key := 'lg.gsv.' || replace(v_game::text, '-', '');
  if current_setting(v_key, true) = '1' then
    return null;
  end if;
  perform set_config(v_key, '1', true);

  -- « select ... from games » : si la partie vient d'être supprimée (cascade), rien n'est inséré.
  insert into public.game_state_version as v (game_id)
  select g.id from public.games g where g.id = v_game
  on conflict (game_id) do update set version = v.version + 1, updated_at = now();

  return null;
end;
$$;

revoke all on function public.bump_game_state_version() from public, anon, authenticated;

do $$
declare
  t text;
begin
  -- Tables dont dépend get_my_game_view (et ses game_view_*), toutes avec une colonne game_id.
  foreach t in array array[
    'game_players', 'game_log', 'game_roles_secret', 'night_actions', 'votes', 'vote_call_agreements',
    'vote_recap_ready', 'day_reveal_ready', 'alpha_infect_agreements', 'anancy_swapped_players',
    'game_artifact_uses', 'game_join_requests', 'game_guest_results', 'game_results'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'table % absente : ignorée', t;
      continue;
    end if;
    execute format('drop trigger if exists trg_bump_game_version on public.%I', t);
    execute format(
      'create constraint trigger trg_bump_game_version after insert or update or delete on public.%I
         deferrable initially deferred for each row execute function public.bump_game_state_version()', t);
  end loop;
end;
$$;

-- games : création, et mises à jour qui ne se limitent pas à last_activity_at.
drop trigger if exists trg_bump_game_version on public.games;
drop trigger if exists trg_bump_game_version_ins on public.games;
create constraint trigger trg_bump_game_version_ins after insert on public.games
  deferrable initially deferred for each row execute function public.bump_game_state_version();
create constraint trigger trg_bump_game_version after update on public.games
  deferrable initially deferred for each row
  when ((to_jsonb(old) - 'last_activity_at') is distinct from (to_jsonb(new) - 'last_activity_at'))
  execute function public.bump_game_state_version();

create or replace function public.get_game_version(p_game_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select version from public.game_state_version where game_id = p_game_id), 0);
$$;

revoke all on function public.get_game_version(uuid) from public, anon;
grant execute on function public.get_game_version(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'game_state_version') then
    alter publication supabase_realtime add table public.game_state_version;
  end if;
exception when others then
  raise notice 'publication Realtime non modifiée (%) : ajoutez game_state_version à supabase_realtime à la main.', sqlerrm;
end;
$$;
