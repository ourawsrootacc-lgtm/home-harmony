-- 0002 — properties + images + favorites
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text not null, type text not null,
  bedrooms int not null default 0, bathrooms int not null default 0, area_sqft int not null default 0,
  address text not null, city text not null,
  lat double precision not null, lng double precision not null,
  monthly_rent bigint not null, deposit bigint not null default 0,
  status text not null default 'active',
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.properties (city, status, monthly_rent);
create index on public.properties (lat, lng);
alter table public.properties enable row level security;

create policy "properties public read" on public.properties for select using (true);
create policy "landlord insert own" on public.properties for insert
  with check (auth.uid() = landlord_id and public.has_role(auth.uid(),'landlord'));
create policy "landlord update own" on public.properties for update
  using (auth.uid() = landlord_id) with check (auth.uid() = landlord_id);
create policy "landlord delete own" on public.properties for delete using (auth.uid() = landlord_id);
create policy "admin manage properties" on public.properties for all
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  url text not null, sort_order int not null default 0
);
alter table public.property_images enable row level security;
create policy "images public read" on public.property_images for select using (true);
create policy "owner manages images" on public.property_images for all
  using (exists (select 1 from public.properties p where p.id = property_id and p.landlord_id = auth.uid()))
  with check (exists (select 1 from public.properties p where p.id = property_id and p.landlord_id = auth.uid()));

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);
alter table public.favorites enable row level security;
create policy "users see own favorites" on public.favorites for select using (auth.uid() = user_id);
create policy "users add own favorites" on public.favorites for insert with check (auth.uid() = user_id);
create policy "users delete own favorites" on public.favorites for delete using (auth.uid() = user_id);
