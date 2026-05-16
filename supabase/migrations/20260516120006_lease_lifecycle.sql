-- 0007 — Court-defensible lease lifecycle (Pakistan)
-- Additive + idempotent. Safe to re-run.

-- 1) status vocabulary -------------------------------------------------------
alter table public.applications drop constraint if exists applications_status_chk;
alter table public.applications
  add constraint applications_status_chk check (status in
    ('pending','under_review','offer_sent','approved','withdrawn',
     'rejected','superseded','fulfilled','cancelled'));

alter table public.leases drop constraint if exists leases_status_chk;
alter table public.leases
  alter column status set default 'draft';
alter table public.leases
  add constraint leases_status_chk check (status in
    ('draft','proposed','countered','rejected','pending_activation',
     'active','holdover','disputed','terminated','ended'));

alter table public.leases
  add column if not exists application_id      uuid references public.applications(id) on delete set null,
  add column if not exists current_version_id  uuid,
  add column if not exists landlord_signed_at  timestamptz,
  add column if not exists tenant_signed_at    timestamptz,
  add column if not exists activated_at        timestamptz,
  add column if not exists ended_at            timestamptz,
  add column if not exists end_reason          text,
  add column if not exists province            text,
  add column if not exists notice_period_days  int  default 30,
  add column if not exists late_fee_pct        numeric default 0,
  add column if not exists escalation_pct      numeric default 0,
  add column if not exists utilities_paid_by   text default 'tenant',
  add column if not exists pets_allowed        boolean default false,
  add column if not exists sublet_allowed      boolean default false,
  add column if not exists lock_in_months      int default 0,
  add column if not exists notes               text;

-- 2) lease_versions (append-only, hashed terms snapshot) --------------------
create table if not exists public.lease_versions (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete cascade,
  prev_version_id uuid references public.lease_versions(id),
  terms jsonb not null,
  terms_hash text not null,
  proposed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.lease_versions enable row level security;
drop policy if exists "parties read versions" on public.lease_versions;
create policy "parties read versions" on public.lease_versions for select
  using (exists (select 1 from public.leases l
                 where l.id = lease_id
                   and (auth.uid() in (l.tenant_id, l.landlord_id)
                        or public.has_role(auth.uid(),'admin'))));
drop policy if exists "parties insert versions" on public.lease_versions;
create policy "parties insert versions" on public.lease_versions for insert
  with check (exists (select 1 from public.leases l
                      where l.id = lease_id
                        and auth.uid() in (l.tenant_id, l.landlord_id)));
-- No UPDATE/DELETE policies => append-only by RLS.

-- 3) lease_signatures -------------------------------------------------------
create table if not exists public.lease_signatures (
  id uuid primary key default gen_random_uuid(),
  lease_version_id uuid not null references public.lease_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('tenant','landlord','witness')),
  terms_hash text not null,
  signed_at timestamptz not null default now(),
  ip inet, user_agent text,
  otp_verified_at timestamptz,
  unique (lease_version_id, user_id, role)
);
alter table public.lease_signatures enable row level security;
drop policy if exists "parties read sigs" on public.lease_signatures;
create policy "parties read sigs" on public.lease_signatures for select
  using (exists (select 1 from public.lease_versions v
                 join public.leases l on l.id = v.lease_id
                 where v.id = lease_version_id
                   and (auth.uid() in (l.tenant_id, l.landlord_id)
                        or public.has_role(auth.uid(),'admin'))));
drop policy if exists "self insert sig" on public.lease_signatures;
create policy "self insert sig" on public.lease_signatures for insert
  with check (auth.uid() = user_id);

-- 4) lease_events (immutable audit log) -------------------------------------
create table if not exists public.lease_events (
  id bigserial primary key,
  lease_id uuid not null references public.leases(id) on delete cascade,
  actor_id uuid references auth.users(id),
  kind text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table public.lease_events enable row level security;
drop policy if exists "parties read events" on public.lease_events;
create policy "parties read events" on public.lease_events for select
  using (exists (select 1 from public.leases l
                 where l.id = lease_id
                   and (auth.uid() in (l.tenant_id, l.landlord_id)
                        or public.has_role(auth.uid(),'admin'))));
drop policy if exists "parties write events" on public.lease_events;
create policy "parties write events" on public.lease_events for insert
  with check (exists (select 1 from public.leases l
                      where l.id = lease_id
                        and auth.uid() in (l.tenant_id, l.landlord_id)));

-- 5) deposit_ledger ---------------------------------------------------------
create table if not exists public.deposit_ledger (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete cascade,
  kind text not null check (kind in ('deposit','advance','rent','refund','deduction')),
  amount bigint not null,
  method text, receipt_url text, note text,
  recorded_by uuid not null references auth.users(id),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  recorded_at timestamptz not null default now()
);
alter table public.deposit_ledger enable row level security;
drop policy if exists "parties read ledger" on public.deposit_ledger;
create policy "parties read ledger" on public.deposit_ledger for select
  using (exists (select 1 from public.leases l
                 where l.id = lease_id
                   and (auth.uid() in (l.tenant_id, l.landlord_id)
                        or public.has_role(auth.uid(),'admin'))));
drop policy if exists "parties write ledger" on public.deposit_ledger;
create policy "parties write ledger" on public.deposit_ledger for insert
  with check (exists (select 1 from public.leases l
                      where l.id = lease_id
                        and auth.uid() in (l.tenant_id, l.landlord_id)));
drop policy if exists "parties ack ledger" on public.deposit_ledger;
create policy "parties ack ledger" on public.deposit_ledger for update
  using (exists (select 1 from public.leases l
                 where l.id = lease_id
                   and auth.uid() in (l.tenant_id, l.landlord_id)));

-- 6) Hard invariants --------------------------------------------------------
create unique index if not exists leases_one_active_per_property
  on public.leases(property_id)
  where status in ('active','pending_activation','holdover','disputed');

create unique index if not exists leases_one_open_per_pair
  on public.leases(property_id, tenant_id)
  where status in ('draft','proposed','countered','pending_activation');

-- 7) Tenant write policy (was missing) --------------------------------------
drop policy if exists "tenant updates own lease" on public.leases;
create policy "tenant updates own lease" on public.leases for update
  using (auth.uid() = tenant_id)
  with check (auth.uid() = tenant_id);

-- 8) Activation trigger -----------------------------------------------------
create or replace function public.on_lease_activated()
returns trigger language plpgsql security definer set search_path = public as $$
declare landlord_sig int; tenant_sig int;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    select count(*) into landlord_sig from public.lease_signatures
      where lease_version_id = new.current_version_id and role = 'landlord';
    select count(*) into tenant_sig from public.lease_signatures
      where lease_version_id = new.current_version_id and role = 'tenant';
    if landlord_sig = 0 or tenant_sig = 0 then
      raise exception 'Lease cannot be active without signatures from both parties on the current version';
    end if;

    update public.properties set status = 'leased' where id = new.property_id;

    update public.applications set status = 'superseded', decided_at = now()
      where property_id = new.property_id
        and id <> coalesce(new.application_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and status in ('pending','under_review','offer_sent');

    update public.leases set status = 'rejected'
      where property_id = new.property_id
        and id <> new.id
        and status in ('draft','proposed','countered','pending_activation');

    if new.application_id is not null then
      update public.applications set status = 'fulfilled', decided_at = now()
        where id = new.application_id;
    end if;

    new.activated_at := coalesce(new.activated_at, now());
    insert into public.lease_events(lease_id, actor_id, kind, payload)
      values (new.id, auth.uid(), 'activated',
              jsonb_build_object('version', new.current_version_id));
  end if;
  return new;
end $$;
drop trigger if exists trg_lease_activated on public.leases;
create trigger trg_lease_activated before update on public.leases
  for each row execute function public.on_lease_activated();

-- 9) Closure trigger --------------------------------------------------------
create or replace function public.on_lease_closed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('ended','terminated') and old.status is distinct from new.status then
    update public.properties set status = 'active' where id = new.property_id;
    new.ended_at := coalesce(new.ended_at, now());
    insert into public.lease_events(lease_id, actor_id, kind, payload)
      values (new.id, auth.uid(), new.status,
              jsonb_build_object('reason', new.end_reason));
  end if;
  return new;
end $$;
drop trigger if exists trg_lease_closed on public.leases;
create trigger trg_lease_closed before update on public.leases
  for each row execute function public.on_lease_closed();
