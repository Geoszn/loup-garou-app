-- ============================================================================
-- Dashboard administrateur — partie 1/2 : schéma.
--
-- Principe de sécurité : le lien vers le dashboard (voir App.tsx) est une
-- URL longue et non devinable, jamais affichée dans l'app — mais ce n'est
-- qu'une couche d'obscurité, PAS le vrai contrôle d'accès. La sécurité
-- réelle vient de `is_admin_user()` ci-dessous, vérifié au tout début de
-- CHAQUE fonction admin_*, exactement comme le reste de l'app vérifie déjà
-- auth.uid()/host_id. Même si l'URL fuite, personne d'autre qu'un compte
-- avec profiles.is_admin = true ne peut rien lire ni modifier.
-- ============================================================================
set search_path = public;

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_reason text,
  add column if not exists banned_at timestamptz;

-- ----------------------------------------------------------------------------
-- app_settings : réglages globaux, une seule ligne (id fixé à 1). Contient
-- pour l'instant l'interrupteur "nouvelles parties" (voir Q/R avec l'hôte :
-- coupe uniquement la création/l'entrée dans de nouvelles parties, les
-- parties déjà en cours vont jusqu'au bout normalement).
-- ----------------------------------------------------------------------------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  new_games_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
-- Aucune policy client : lecture publique via get_app_status() (RPC dédiée,
-- security definer), écriture uniquement via admin_set_new_games_enabled().

-- ----------------------------------------------------------------------------
-- admin_audit_log : trace de chaque action faite depuis le dashboard —
-- qui (admin_id), quoi (action), sur quoi (target), avec quels détails.
-- Consultable uniquement par un admin (admin_list_audit_log).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- Aucune policy client — accès exclusivement via admin_list_audit_log.

-- ----------------------------------------------------------------------------
-- admin_access_log : chaque tentative d'ouverture du dashboard, réussie ou
-- non (admin_check_access() écrit ici systématiquement). Permet de repérer
-- si quelqu'un d'autre est tombé sur le lien.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  allowed boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_access_log_created_idx on public.admin_access_log (created_at desc);

alter table public.admin_access_log enable row level security;
-- Aucune policy client — accès exclusivement via admin_list_access_log.

-- ----------------------------------------------------------------------------
-- is_admin_user : helper central réutilisé par toutes les fonctions
-- admin_* (voir migration suivante). `stable` (pas `immutable`, le
-- résultat peut changer si on retire les droits d'un compte) et security
-- definer pour pouvoir lire profiles.is_admin même si un jour une policy
-- RLS plus restrictive venait à limiter cette colonne.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = p_user_id), false);
$$;
