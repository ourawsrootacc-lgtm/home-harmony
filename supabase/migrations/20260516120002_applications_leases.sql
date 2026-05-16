-- 0003 — applications + leases
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references auth.users(id) on delete cascade,
  message text, status text not null default 'pending',
  created_at timestamptz not null default now(), decided_at timestamptz
);
create unique index applications_unique_open
  on public.applications (property_id, tenant_id) where status = 'pending';
alter table public.applications enable row level security;

create policy "tenant sees own apps" on public.applications for select using (auth.uid() = tenant_id);
create policy "landlord sees apps to their props" on public.applications for select
  using (exists (select 1 from public.properties p where p.id = property_id and p.landlord_id = auth.uid()));
create policy "admin sees all apps" on public.applications for select using (public.has_role(auth.uid(),'admin'));
create policy "tenant creates apps" on public.applications for insert
  with check (auth.uid() = tenant_id and public.has_role(auth.uid(),'tenant'));
create policy "tenant cancels own" on public.applications for update
  using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "landlord decides on apps" on public.applications for update
  using (exists (select 1 from public.properties p where p.id = property_id and p.landlord_id = auth.uid()));

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references auth.users(id) on delete cascade,
  landlord_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null, end_date date not null,
  monthly_rent bigint not null, deposit bigint not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);
alter table public.leases enable row level security;
create policy "lease parties read" on public.leases for select
  using (auth.uid() in (tenant_id, landlord_id) or public.has_role(auth.uid(),'admin'));
create policy "landlord manages leases" on public.leases for all
  using (auth.uid() = landlord_id) with check (auth.uid() = landlord_id);
