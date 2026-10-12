-- Point rouge « nouveauté » sur la barre du bas : dès qu'un nouvel article (artefact ou skin) est mis en vente dans le
-- Loup Store, l'onglet Récompenses affiche un point rouge, jusqu'à ce que le joueur ouvre la boutique.
--
-- `profiles.store_seen_at` : dernière ouverture de la boutique. Un article est « nouveau » pour un joueur quand il est
-- en vente (mêmes conditions que get_store_artifacts / list_store_skins), qu'il ne le possède pas, et que sa mise en
-- vente (le plus tardif de created_at et starts_at, pour qu'un article programmé compte à son ouverture) est postérieure à
-- cette date. Les comptes existants démarrent à « maintenant » : seuls les articles ajoutés ensuite comptent.
-- À appliquer AVANT 0245 (le fond Plage) pour que celui-ci déclenche bien le point rouge chez tout le monde.
set search_path = public;

alter table public.profiles add column if not exists store_seen_at timestamptz not null default now();

create or replace function public.get_store_unseen_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (
      select count(*)
      from public.store_artifacts sa
      where sa.active
        and (sa.starts_at is null or sa.starts_at <= now())
        and (sa.ends_at is null or sa.ends_at > now())
        and greatest(coalesce(sa.starts_at, sa.created_at), sa.created_at) > p.store_seen_at
        and not exists (
          select 1 from public.player_artifacts pa
          where pa.artifact_id = sa.id and pa.user_id = p.id and pa.quantity > 0
        )
    ) + (
      select count(*)
      from public.store_skins s
      where s.season_id is null
        and s.is_active
        and s.price_coins > 0
        and (s.starts_at is null or s.starts_at <= now())
        and (s.ends_at is null or s.ends_at > now())
        and greatest(coalesce(s.starts_at, s.created_at), s.created_at) > p.store_seen_at
        and not exists (
          select 1 from public.player_skins ps where ps.skin_id = s.id and ps.user_id = p.id
        )
    )
  )::int
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.mark_store_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set store_seen_at = now() where id = auth.uid();
$$;

revoke execute on function public.get_store_unseen_count() from public, anon;
grant execute on function public.get_store_unseen_count() to authenticated;
revoke execute on function public.mark_store_seen() from public, anon;
grant execute on function public.mark_store_seen() to authenticated;
