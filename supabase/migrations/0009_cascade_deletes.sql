-- ============================================================================
-- Correctif : permettre la suppression d'un compte (Authentication > Users)
-- même s'il a déjà créé ou rejoint une partie. Sans ceci, Postgres refuse la
-- suppression avec une erreur de contrainte de clé étrangère.
--
-- - Les lignes qui "appartiennent" au joueur (sa place dans une partie, son
--   rôle secret, ses actions, ses votes) sont supprimées avec lui (CASCADE).
-- - Les références où il n'est que la CIBLE d'une action d'un autre joueur
--   sont simplement vidées (SET NULL) pour ne pas effacer l'action de
--   quelqu'un d'autre.
-- - Si le compte de l'hôte d'une partie est supprimé, la partie entière est
--   supprimée avec lui (elle cascade déjà vers game_players, etc.).
-- ============================================================================
set search_path = public;

alter table public.games
  drop constraint if exists games_host_id_fkey,
  add constraint games_host_id_fkey
    foreign key (host_id) references public.profiles (id) on delete cascade;

alter table public.game_players
  drop constraint if exists game_players_user_id_fkey,
  add constraint game_players_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.game_roles_secret
  drop constraint if exists game_roles_secret_user_id_fkey,
  add constraint game_roles_secret_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.game_roles_secret
  drop constraint if exists game_roles_secret_lover_with_fkey,
  add constraint game_roles_secret_lover_with_fkey
    foreign key (lover_with) references public.profiles (id) on delete set null;

alter table public.night_actions
  drop constraint if exists night_actions_actor_id_fkey,
  add constraint night_actions_actor_id_fkey
    foreign key (actor_id) references public.profiles (id) on delete cascade;

alter table public.night_actions
  drop constraint if exists night_actions_target_id_fkey,
  add constraint night_actions_target_id_fkey
    foreign key (target_id) references public.profiles (id) on delete set null;

alter table public.votes
  drop constraint if exists votes_voter_id_fkey,
  add constraint votes_voter_id_fkey
    foreign key (voter_id) references public.profiles (id) on delete cascade;

alter table public.votes
  drop constraint if exists votes_target_id_fkey,
  add constraint votes_target_id_fkey
    foreign key (target_id) references public.profiles (id) on delete set null;

alter table public.games
  drop constraint if exists games_hunter_pending_fkey,
  add constraint games_hunter_pending_fkey
    foreign key (hunter_pending) references public.profiles (id) on delete set null;
