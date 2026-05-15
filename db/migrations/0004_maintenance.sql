-- 0004 — maintenance tickets
create table public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references auth.users(id) on delete cascade,
  category text not null, priority text not null default 'medium', description text not null,
  photos jsonb not null default '[]'::jsonb,
  before_photos jsonb not null default '[]'::jsonb,
  after_photos jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.maintenance_tickets enable row level security;

create policy "tenant reads own tickets" on public.maintenance_tickets for select using (auth.uid() = tenant_id);
create policy "landlord reads tickets on own props" on public.maintenance_tickets for select
  using (exists (select 1 from public.properties p where p.id = property_id and p.landlord_id = auth.uid()));
create policy "maintenance reads all tickets" on public.maintenance_tickets for select
  using (public.has_role(auth.uid(),'maintenance') or public.has_role(auth.uid(),'admin'));
create policy "tenant creates tickets" on public.maintenance_tickets for insert
  with check (auth.uid() = tenant_id);
create policy "maintenance updates tickets" on public.maintenance_tickets for update
  using (public.has_role(auth.uid(),'maintenance') or public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'maintenance') or public.has_role(auth.uid(),'admin'));
create policy "landlord updates tickets on own props" on public.maintenance_tickets for update
  using (exists (select 1 from public.properties p where p.id = property_id and p.landlord_id = auth.uid()));
