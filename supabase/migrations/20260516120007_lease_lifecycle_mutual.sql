-- 0008 — Mutual lease lifecycle: re-apply 0007 + add request-based amendments,
-- extensions, renewals, and terminations. Idempotent; safe to re-run.
--
-- After saving this file, apply it to the live database with:
--     supabase db push
-- (or copy this file into supabase/migrations/<timestamp>_lease_lifecycle_mutual.sql
-- and run the same command).

-- =========================================================================
-- PART A — Re-apply 0007 defensively. Every statement is additive /
-- `if not exists` so this is a no-op if 0007 already landed.
-- =========================================================================

alter table public.applications drop constraint if exists applications_status_chk;
alter table public.applications
  add constraint applications_status_chk check (status in
    ('pending','under_review','offer_sent','approved','withdrawn',
     'rejected','superseded','fulfilled','cancelled'));

alter table public.leases drop constraint if exists leases_status_chk;
alter table public.leases alter column status set default 'draft';
alter table public.leases
  add constraint leases_status_chk check (status in
    ('draft','proposed','countered','rejected','pending_activation',
     'active','holdover','disputed','pending_closure','terminated','ended'));

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

create unique index if not exists leases_one_active_per_property
  on public.leases(property_id)
  where status in ('active','pending_activation','holdover','disputed','pending_closure');

create unique index if not exists leases_one_open_per_pair
  on public.leases(property_id, tenant_id)
  where status in ('draft','proposed','countered','pending_activation');

drop policy if exists "tenant updates own lease" on public.leases;
create policy "tenant updates own lease" on public.leases for update
  using (auth.uid() = tenant_id)
  with check (auth.uid() = tenant_id);

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

-- =========================================================================
-- PART B — Mutual change requests (amendment, extension, renewal, termination)
-- =========================================================================

create table if not exists public.lease_requests (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete cascade,
  kind text not null check (kind in ('amendment','extension','renewal','termination')),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','countered','withdrawn','superseded')),
  requested_by uuid not null references auth.users(id),
  proposed_terms jsonb,                -- amendment / renewal: full LeaseTerms snapshot
  new_end_date    date,                -- extension / renewal
  effective_date  date,                -- termination (>= notice_served_at + notice_period_days)
  ground          text,                -- termination ground (enum-by-convention)
  ground_details  text,
  notice_served_at timestamptz default now(),
  responded_by  uuid references auth.users(id),
  responded_at  timestamptz,
  resulting_version_id uuid references public.lease_versions(id),
  created_at timestamptz not null default now()
);

alter table public.lease_requests enable row level security;

create unique index if not exists lease_requests_one_pending_per_kind
  on public.lease_requests(lease_id, kind)
  where status = 'pending';

drop policy if exists "parties read requests" on public.lease_requests;
create policy "parties read requests" on public.lease_requests for select
  using (exists (select 1 from public.leases l
                 where l.id = lease_id
                   and (auth.uid() in (l.tenant_id, l.landlord_id)
                        or public.has_role(auth.uid(),'admin'))));

drop policy if exists "parties insert requests" on public.lease_requests;
create policy "parties insert requests" on public.lease_requests for insert
  with check (
    auth.uid() = requested_by
    and exists (select 1 from public.leases l
                where l.id = lease_id
                  and auth.uid() in (l.tenant_id, l.landlord_id))
  );

drop policy if exists "respond or withdraw requests" on public.lease_requests;
create policy "respond or withdraw requests" on public.lease_requests for update
  using (
    exists (select 1 from public.leases l
            where l.id = lease_id
              and auth.uid() in (l.tenant_id, l.landlord_id))
  )
  with check (
    exists (select 1 from public.leases l
            where l.id = lease_id
              and auth.uid() in (l.tenant_id, l.landlord_id))
  );

create or replace function public.on_request_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l record;
  v_id uuid;
  v_hash text;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select * into l from public.leases where id = new.lease_id;

    if auth.uid() = new.requested_by then
      raise exception 'Cannot accept your own request';
    end if;

    new.responded_by := auth.uid();
    new.responded_at := now();

    if new.kind = 'extension' then
      if new.new_end_date is null then
        raise exception 'Extension request requires new_end_date';
      end if;
      update public.leases set end_date = new.new_end_date where id = l.id;
      insert into public.lease_events(lease_id, actor_id, kind, payload)
        values (l.id, auth.uid(), 'extended',
                jsonb_build_object('new_end_date', new.new_end_date,
                                   'request_id', new.id));

    elsif new.kind in ('amendment','renewal') then
      if new.proposed_terms is null then
        raise exception 'Amendment/renewal requires proposed_terms';
      end if;
      v_hash := encode(sha256(convert_to(new.proposed_terms::text, 'UTF8')), 'hex');
      insert into public.lease_versions(lease_id, prev_version_id, terms, terms_hash, proposed_by)
        values (l.id, l.current_version_id, new.proposed_terms, v_hash, new.requested_by)
        returning id into v_id;
      update public.leases set
        current_version_id = v_id,
        status = case when new.kind = 'renewal' then 'pending_activation' else l.status end,
        monthly_rent = coalesce((new.proposed_terms->>'monthly_rent')::bigint, l.monthly_rent),
        deposit      = coalesce((new.proposed_terms->>'deposit')::bigint, l.deposit),
        start_date   = coalesce((new.proposed_terms->>'start_date')::date, l.start_date),
        end_date     = coalesce((new.proposed_terms->>'end_date')::date, l.end_date),
        notice_period_days = coalesce((new.proposed_terms->>'notice_period_days')::int, l.notice_period_days),
        late_fee_pct  = coalesce((new.proposed_terms->>'late_fee_pct')::numeric, l.late_fee_pct),
        escalation_pct = coalesce((new.proposed_terms->>'escalation_pct')::numeric, l.escalation_pct),
        utilities_paid_by = coalesce(new.proposed_terms->>'utilities_paid_by', l.utilities_paid_by),
        pets_allowed   = coalesce((new.proposed_terms->>'pets_allowed')::boolean, l.pets_allowed),
        sublet_allowed = coalesce((new.proposed_terms->>'sublet_allowed')::boolean, l.sublet_allowed),
        lock_in_months = coalesce((new.proposed_terms->>'lock_in_months')::int, l.lock_in_months),
        province       = coalesce(new.proposed_terms->>'province', l.province),
        notes          = coalesce(new.proposed_terms->>'notes', l.notes)
      where id = l.id;
      new.resulting_version_id := v_id;
      insert into public.lease_events(lease_id, actor_id, kind, payload)
        values (l.id, auth.uid(), new.kind || '_accepted',
                jsonb_build_object('version_id', v_id, 'hash', v_hash, 'request_id', new.id));

    elsif new.kind = 'termination' then
      if new.effective_date is null then
        raise exception 'Termination requires effective_date';
      end if;
      if new.effective_date < (new.notice_served_at::date + coalesce(l.notice_period_days, 30)) then
        raise exception 'Effective date must respect the % day notice period', coalesce(l.notice_period_days, 30);
      end if;
      update public.leases set
        status = 'terminated',
        end_reason = coalesce(new.ground, 'mutual_agreement'),
        ended_at = new.effective_date::timestamptz
      where id = l.id;
      insert into public.lease_events(lease_id, actor_id, kind, payload)
        values (l.id, auth.uid(), 'terminated',
                jsonb_build_object('ground', new.ground,
                                   'effective_date', new.effective_date,
                                   'request_id', new.id));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_request_accepted on public.lease_requests;
create trigger trg_request_accepted before update on public.lease_requests
  for each row execute function public.on_request_accepted();

create or replace function public.on_request_closed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('declined','withdrawn') and old.status is distinct from new.status then
    new.responded_by := coalesce(new.responded_by, auth.uid());
    new.responded_at := coalesce(new.responded_at, now());
    insert into public.lease_events(lease_id, actor_id, kind, payload)
      values (new.lease_id, auth.uid(), new.kind || '_' || new.status,
              jsonb_build_object('request_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists trg_request_closed on public.lease_requests;
create trigger trg_request_closed before update on public.lease_requests
  for each row execute function public.on_request_closed();

create or replace function public.on_request_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.lease_events(lease_id, actor_id, kind, payload)
    values (new.lease_id, new.requested_by, new.kind || '_requested',
            jsonb_build_object('request_id', new.id,
                               'effective_date', new.effective_date,
                               'new_end_date', new.new_end_date,
                               'ground', new.ground));
  return new;
end $$;
drop trigger if exists trg_request_created on public.lease_requests;
create trigger trg_request_created after insert on public.lease_requests
  for each row execute function public.on_request_created();
