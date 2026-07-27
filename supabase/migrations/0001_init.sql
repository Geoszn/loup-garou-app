-- ============================================================================
-- Loups-Garous en ligne — schéma initial
-- ============================================================================
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles : miroir public de auth.users
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- games
-- ----------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references public.profiles (id),
  status text not null default 'lobby'
    check (status in ('lobby','role_reveal','night','day_reveal','day_discussion','day_vote','ended')),
  night_number int not null default 0,
  night_step text
    check (night_step in ('cupidon','voyante','loup_garou','sorciere','petite_fille','resolve')),
  phase_deadline timestamptz,
  settings jsonb not null default '{
    "discussion_seconds": 90,
    "vote_seconds": 45,
    "night_step_seconds": 40,
    "role_reveal_seconds": 15,
    "role_counts": null
  }'::jsonb,
  winner_team text check (winner_team in ('village','loups','amoureux')),
  hunter_pending uuid references public.profiles (id),
  hunter_context text check (hunter_context in ('night','day')),
  night_deaths_resolved boolean not null default false,
  day_vote_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists games_code_idx on public.games (code);

-- ----------------------------------------------------------------------------
-- game_players : informations PUBLIQUES uniquement (jamais le rôle)
-- ----------------------------------------------------------------------------
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  display_name text not null,
  seat_number int not null,
  is_host boolean not null default false,
  is_alive boolean not null default true,
  death_cause text,
  died_at_night int,
  is_lover boolean not null default false,
  revealed_role text,
  avatar_color text not null default '#334160',
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index if not exists game_players_game_idx on public.game_players (game_id);

-- ----------------------------------------------------------------------------
-- game_roles_secret : jamais exposé directement aux clients
-- ----------------------------------------------------------------------------
create table if not exists public.game_roles_secret (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  role text not null,
  lover_with uuid references public.profiles (id),
  heal_potion_used boolean not null default false,
  poison_potion_used boolean not null default false,
  primary key (game_id, user_id)
);

-- ----------------------------------------------------------------------------
-- night_actions : secrètes, uniquement via fonctions
-- ----------------------------------------------------------------------------
create table if not exists public.night_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  night_number int not null,
  step text not null,
  actor_id uuid not null references public.profiles (id),
  target_id uuid references public.profiles (id),
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (game_id, night_number, step, actor_id)
);

-- ----------------------------------------------------------------------------
-- votes (vote de jour)
-- ----------------------------------------------------------------------------
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  round_number int not null,
  voter_id uuid not null references public.profiles (id),
  target_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (game_id, round_number, voter_id)
);

-- ----------------------------------------------------------------------------
-- game_log : messages publics (narration du meneur de jeu automatique)
-- ----------------------------------------------------------------------------
create table if not exists public.game_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_log_game_idx on public.game_log (game_id, created_at);
