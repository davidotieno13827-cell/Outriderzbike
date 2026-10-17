create table if not exists public.shop_admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.shop_admins enable row level security;
revoke all on public.shop_admins from anon, authenticated;

create or replace function public.is_shop_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.shop_admins
        where user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_shop_admin() from public;
grant execute on function public.is_shop_admin() to anon, authenticated;

create table if not exists public.shop_content (
    collection text not null check (collection in ('bikes', 'spares', 'bookings', 'customers', 'sale_bikes')),
    id text not null,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (collection, id)
);

alter table public.shop_content enable row level security;
grant usage on schema public to anon, authenticated;
grant select on public.shop_content to anon, authenticated;
grant insert, update, delete on public.shop_content to authenticated;

drop policy if exists "Public reads published shop content" on public.shop_content;
drop policy if exists "Admins read all shop content" on public.shop_content;
drop policy if exists "Admins insert shop content" on public.shop_content;
drop policy if exists "Admins update shop content" on public.shop_content;
drop policy if exists "Admins delete shop content" on public.shop_content;

create policy "Public reads published shop content"
    on public.shop_content for select
    to anon, authenticated
    using (collection in ('bikes', 'sale_bikes'));

drop policy if exists "Admins read all shop content" on public.shop_content;
create policy "Admins read all shop content"
    on public.shop_content for select
    to authenticated
    using ((select public.is_shop_admin()));

drop policy if exists "Admins insert shop content" on public.shop_content;
create policy "Admins insert shop content"
    on public.shop_content for insert
    to authenticated
    with check ((select public.is_shop_admin()));

drop policy if exists "Admins update shop content" on public.shop_content;
create policy "Admins update shop content"
    on public.shop_content for update
    to authenticated
    using ((select public.is_shop_admin()))
    with check ((select public.is_shop_admin()));

drop policy if exists "Admins delete shop content" on public.shop_content;
create policy "Admins delete shop content"
    on public.shop_content for delete
    to authenticated
    using ((select public.is_shop_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-photos', 'shop-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads shop photos" on storage.objects;
create policy "Public reads shop photos"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'shop-photos');

drop policy if exists "Admins upload shop photos" on storage.objects;
create policy "Admins upload shop photos"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'shop-photos'
        and (select public.is_shop_admin())
    );

drop policy if exists "Admins update shop photos" on storage.objects;
create policy "Admins update shop photos"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'shop-photos' and (select public.is_shop_admin()))
    with check (bucket_id = 'shop-photos' and (select public.is_shop_admin()));

drop policy if exists "Admins delete shop photos" on storage.objects;
create policy "Admins delete shop photos"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'shop-photos' and (select public.is_shop_admin()));

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'shop_content'
    ) then
        alter publication supabase_realtime add table public.shop_content;
    end if;
end
$$;

-- First invite the owner in Supabase Authentication, then run this to grant admin access:
-- insert into public.shop_admins (user_id)
-- select id from auth.users where email = 'outridersbikingandadventure@gmail.com'
-- on conflict do nothing;
