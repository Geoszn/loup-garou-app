-- Annonces affichées une seule fois par joueur (popup sur le tableau de bord).
-- Le contenu des annonces vit dans l'application (clé stable, ex.
-- 'avatars-2026-09') ; la base ne retient que qui l'a déjà vue.
set search_path = public;

create table if not exists public.announcement_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  announcement_key text not null check (char_length(announcement_key) between 1 and 60),
  seen_at timestamptz not null default now(),
  primary key (user_id, announcement_key)
);

alter table public.announcement_views enable row level security;
revoke all on public.announcement_views from anon, authenticated;

create or replace function public.get_my_seen_announcements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(announcement_key), '[]'::jsonb)
  from public.announcement_views
  where user_id = auth.uid();
$$;

create or replace function public.mark_announcement_seen(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if p_key is null or char_length(p_key) not between 1 and 60 then
    raise exception 'Annonce invalide.';
  end if;
  insert into public.announcement_views (user_id, announcement_key)
  values (auth.uid(), p_key)
  on conflict do nothing;
end;
$$;

revoke execute on function public.get_my_seen_announcements() from public, anon;
revoke execute on function public.mark_announcement_seen(text) from public, anon;
grant execute on function public.get_my_seen_announcements() to authenticated;
grant execute on function public.mark_announcement_seen(text) to authenticated;
