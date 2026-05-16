-- Maintenance lifecycle: broadcast dispatch, quotes/negotiation, audit trail,
-- mutual reviews, cancellations. Phase 1 = schema + triggers + RLS only.
-- Idempotent: safe to re-run.

-- =====================================================================
-- 1. Extend maintenance_tickets with new lifecycle columns
-- =====================================================================
alter table public.maintenance_tickets
  add column if not exists funded_by text not null default 'landlord'
    check (funded_by in ('landlord','tenant')),
  add column if not exists accepted_quote_id uuid,
  add column if not exists sla_due_at timestamptz,
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists checked_in_at timestamptz,
  add column if not exists work_done_at timestamptz,
  add column if not exists tenant_verified_at timestamptz,
  add column if not exists auto_verify_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists dispute_opened_at timestamptz;

alter table public.maintenance_tickets drop constraint if exists maintenance_tickets_status_check;
alter table public.maintenance_tickets
  add constraint maintenance_tickets_status_check check (status in (
    'open','submitted','triaged','dispatched','quoted','counter_quote',
    'scheduled','reschedule_requested','in_progress','work_done','resolved',
    'tenant_verified','disputed','closed','cancelled'
  ));

-- =====================================================================
-- 2. Audit trail (append-only)
-- =====================================================================
create table if not exists public.maintenance_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_tickets(id) on delete cascade,
  actor_id uuid references auth.users(id),
  actor_role text,
  event_type text not null,
  from_state text,
  to_state text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists maintenance_events_ticket_idx
  on public.maintenance_events(ticket_id, created_at desc);

alter table public.maintenance_events enable row level security;

drop policy if exists "parties read events" on public.maintenance_events;
create policy "parties read events" on public.maintenance_events for select
  using (
    exists (
      select 1 from public.maintenance_tickets t
      left join public.properties p on p.id = t.property_id
      where t.id = ticket_id and (
        t.tenant_id = auth.uid()
        or p.landlord_id = auth.uid()
        or t.assigned_to = auth.uid()
        or public.has_role(auth.uid(),'maintenance')
        or public.has_role(auth.uid(),'admin')
      )
    )
  );

create or replace function public._log_maintenance_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.maintenance_events (ticket_id, actor_id, event_type, to_state, payload)
    values (new.id, new.tenant_id, 'status_change', new.status,
            jsonb_build_object('source','create'));
  elsif tg_op = 'UPDATE' and (old.status is distinct from new.status) then
    insert into public.maintenance_events (ticket_id, actor_id, event_type, from_state, to_state, payload)
    values (new.id, auth.uid(), 'status_change', old.status, new.status,
            jsonb_build_object());
  end if;
  return new;
end $$;

drop trigger if exists trg_log_maintenance_status on public.maintenance_tickets;
create trigger trg_log_maintenance_status
  after insert or update of status on public.maintenance_tickets
  for each row execute function public._log_maintenance_status_change();

-- =====================================================================
-- 3. Dispatch — broadcast first-accept-wins
-- =====================================================================
create table if not exists public.maintenance_assignments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_tickets(id) on delete cascade,
  technician_id uuid not null references auth.users(id) on delete cascade,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  response text not null default 'pending'
    check (response in ('pending','accepted','declined','superseded','expired')),
  responded_at timestamptz,
  decline_reason text,
  unique (ticket_id, technician_id)
);
create index if not exists maintenance_assignments_tech_idx
  on public.maintenance_assignments(technician_id, response);

alter table public.maintenance_assignments enable row level security;

drop policy if exists "tech reads own offers" on public.maintenance_assignments;
create policy "tech reads own offers" on public.maintenance_assignments for select
  using (technician_id = auth.uid()
    or public.has_role(auth.uid(),'admin')
    or exists (select 1 from public.maintenance_tickets t
               left join public.properties p on p.id = t.property_id
               where t.id = ticket_id
                 and (t.tenant_id = auth.uid() or p.landlord_id = auth.uid())));

drop policy if exists "landlord/admin dispatches" on public.maintenance_assignments;
create policy "landlord/admin dispatches" on public.maintenance_assignments for insert
  with check (
    public.has_role(auth.uid(),'admin')
    or exists (select 1 from public.maintenance_tickets t
               join public.properties p on p.id = t.property_id
               where t.id = ticket_id and p.landlord_id = auth.uid())
  );

drop policy if exists "tech responds to own offer" on public.maintenance_assignments;
create policy "tech responds to own offer" on public.maintenance_assignments for update
  using (technician_id = auth.uid())
  with check (technician_id = auth.uid());

create or replace function public._handle_assignment_accept()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.response = 'accepted' and (old.response is distinct from 'accepted') then
    update public.maintenance_assignments
      set response = 'superseded', responded_at = now()
      where ticket_id = new.ticket_id
        and id <> new.id
        and response = 'pending';

    update public.maintenance_tickets
      set assigned_to = new.technician_id,
          status = case when status in ('dispatched','triaged','open','submitted')
                        then 'quoted' else status end
      where id = new.ticket_id;

    insert into public.maintenance_events (ticket_id, actor_id, event_type, payload)
    values (new.ticket_id, new.technician_id, 'assignment_accepted',
            jsonb_build_object('assignment_id', new.id));

    new.responded_at := now();
  elsif new.response = 'declined' and (old.response is distinct from 'declined') then
    new.responded_at := now();
    insert into public.maintenance_events (ticket_id, actor_id, event_type, payload)
    values (new.ticket_id, new.technician_id, 'assignment_declined',
            jsonb_build_object('assignment_id', new.id, 'reason', new.decline_reason));
  end if;
  return new;
end $$;

drop trigger if exists trg_assignment_accept on public.maintenance_assignments;
create trigger trg_assignment_accept
  before update on public.maintenance_assignments
  for each row execute function public._handle_assignment_accept();

-- =====================================================================
-- 4. Quotes — negotiation log
-- =====================================================================
create table if not exists public.maintenance_quotes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_tickets(id) on delete cascade,
  technician_id uuid not null references auth.users(id) on delete cascade,
  parent_quote_id uuid references public.maintenance_quotes(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_by_role text not null check (created_by_role in ('technician','tenant','landlord')),
  price bigint not null check (price >= 0),
  currency text not null default 'PKR',
  scope text not null,
  proposed_start_at timestamptz not null,
  proposed_end_at timestamptz not null,
  notes text,
  is_change_order boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','accepted','countered','declined','withdrawn','superseded')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (proposed_end_at > proposed_start_at)
);
create index if not exists maintenance_quotes_ticket_idx
  on public.maintenance_quotes(ticket_id, created_at desc);

alter table public.maintenance_quotes enable row level security;

drop policy if exists "parties read quotes" on public.maintenance_quotes;
create policy "parties read quotes" on public.maintenance_quotes for select
  using (
    technician_id = auth.uid()
    or public.has_role(auth.uid(),'admin')
    or exists (select 1 from public.maintenance_tickets t
               left join public.properties p on p.id = t.property_id
               where t.id = ticket_id
                 and (t.tenant_id = auth.uid() or p.landlord_id = auth.uid()))
  );

drop policy if exists "parties insert quotes" on public.maintenance_quotes;
create policy "parties insert quotes" on public.maintenance_quotes for insert
  with check (
    created_by = auth.uid() and (
      (created_by_role = 'technician' and technician_id = auth.uid()
        and exists (select 1 from public.maintenance_assignments a
                    where a.ticket_id = ticket_id and a.technician_id = auth.uid()
                      and a.response in ('pending','accepted')))
      or (created_by_role = 'tenant'
          and exists (select 1 from public.maintenance_tickets t
                      where t.id = ticket_id and t.tenant_id = auth.uid()))
      or (created_by_role = 'landlord'
          and exists (select 1 from public.maintenance_tickets t
                      join public.properties p on p.id = t.property_id
                      where t.id = ticket_id and p.landlord_id = auth.uid()))
    )
  );

drop policy if exists "respond to quote" on public.maintenance_quotes;
create policy "respond to quote" on public.maintenance_quotes for update
  using (
    public.has_role(auth.uid(),'admin')
    or created_by = auth.uid()
    or technician_id = auth.uid()
    or exists (select 1 from public.maintenance_tickets t
               left join public.properties p on p.id = t.property_id
               where t.id = ticket_id
                 and (t.tenant_id = auth.uid() or p.landlord_id = auth.uid()))
  );

create or replace function public._handle_quote_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.maintenance_events (ticket_id, actor_id, actor_role, event_type, payload)
    values (new.ticket_id, new.created_by, new.created_by_role, 'quote_submitted',
            jsonb_build_object('quote_id', new.id, 'price', new.price,
                               'start', new.proposed_start_at, 'end', new.proposed_end_at,
                               'change_order', new.is_change_order));
    update public.maintenance_tickets
      set status = case
        when new.is_change_order then status
        when new.created_by_role = 'technician' and status in ('dispatched','triaged','open','submitted')
          then 'quoted'
        when new.created_by_role in ('tenant','landlord') and status = 'quoted'
          then 'counter_quote'
        else status end
      where id = new.ticket_id;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.maintenance_events (ticket_id, actor_id, event_type, payload)
    values (new.ticket_id, auth.uid(), 'quote_' || new.status,
            jsonb_build_object('quote_id', new.id, 'price', new.price));

    if new.status = 'accepted' then
      update public.maintenance_quotes
        set status = 'superseded', responded_at = now()
        where ticket_id = new.ticket_id and id <> new.id and status in ('pending','countered');

      update public.maintenance_tickets
        set accepted_quote_id = new.id,
            assigned_to = new.technician_id,
            scheduled_start_at = new.proposed_start_at,
            scheduled_end_at = new.proposed_end_at,
            status = 'scheduled'
        where id = new.ticket_id;
    end if;
    new.responded_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_quote_change on public.maintenance_quotes;
create trigger trg_quote_change
  before insert or update on public.maintenance_quotes
  for each row execute function public._handle_quote_change();

do $$ begin
  alter table public.maintenance_tickets
    add constraint maintenance_tickets_accepted_quote_fk
    foreign key (accepted_quote_id) references public.maintenance_quotes(id) on delete set null;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 5. Cancellations
-- =====================================================================
create table if not exists public.maintenance_cancellations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_tickets(id) on delete cascade,
  cancelled_by uuid not null references auth.users(id),
  cancelled_by_role text not null check (cancelled_by_role in ('tenant','landlord','technician','admin')),
  reason_code text not null,
  notes text,
  fee_amount bigint not null default 0,
  fee_payer text check (fee_payer in ('tenant','landlord','technician','none')) default 'none',
  within_24h boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.maintenance_cancellations enable row level security;

drop policy if exists "parties read cancellations" on public.maintenance_cancellations;
create policy "parties read cancellations" on public.maintenance_cancellations for select
  using (
    public.has_role(auth.uid(),'admin')
    or exists (select 1 from public.maintenance_tickets t
               left join public.properties p on p.id = t.property_id
               where t.id = ticket_id
                 and (t.tenant_id = auth.uid() or p.landlord_id = auth.uid() or t.assigned_to = auth.uid()))
  );

drop policy if exists "parties cancel" on public.maintenance_cancellations;
create policy "parties cancel" on public.maintenance_cancellations for insert
  with check (
    cancelled_by = auth.uid() and (
      public.has_role(auth.uid(),'admin')
      or exists (select 1 from public.maintenance_tickets t
                 left join public.properties p on p.id = t.property_id
                 where t.id = ticket_id
                   and (t.tenant_id = auth.uid() or p.landlord_id = auth.uid() or t.assigned_to = auth.uid()))
    )
  );

create or replace function public._handle_cancellation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz;
begin
  select scheduled_start_at into v_start from public.maintenance_tickets where id = new.ticket_id;
  new.within_24h := (v_start is not null and v_start - now() < interval '24 hours');

  update public.maintenance_tickets
    set status = 'cancelled', cancelled_at = now()
    where id = new.ticket_id;

  insert into public.maintenance_events (ticket_id, actor_id, actor_role, event_type, payload)
  values (new.ticket_id, new.cancelled_by, new.cancelled_by_role, 'cancelled',
          jsonb_build_object('reason', new.reason_code, 'within_24h', new.within_24h,
                             'fee_amount', new.fee_amount, 'fee_payer', new.fee_payer));
  return new;
end $$;

drop trigger if exists trg_cancellation on public.maintenance_cancellations;
create trigger trg_cancellation
  before insert on public.maintenance_cancellations
  for each row execute function public._handle_cancellation();

-- =====================================================================
-- 6. Mutual reviews
-- =====================================================================
create table if not exists public.maintenance_reviews (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_tickets(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  ratee_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('tenant_to_tech','tech_to_tenant','landlord_to_tech')),
  stars int not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (ticket_id, rater_id, direction)
);
create index if not exists maintenance_reviews_ratee_idx on public.maintenance_reviews(ratee_id);

alter table public.maintenance_reviews enable row level security;

drop policy if exists "public reads reviews" on public.maintenance_reviews;
create policy "public reads reviews" on public.maintenance_reviews for select using (true);

drop policy if exists "parties insert reviews" on public.maintenance_reviews;
create policy "parties insert reviews" on public.maintenance_reviews for insert
  with check (
    rater_id = auth.uid()
    and exists (select 1 from public.maintenance_tickets t
                left join public.properties p on p.id = t.property_id
                where t.id = ticket_id
                  and t.status in ('tenant_verified','closed')
                  and (t.tenant_id = auth.uid() or p.landlord_id = auth.uid() or t.assigned_to = auth.uid()))
  );

-- =====================================================================
-- 7. Technician profile
-- =====================================================================
create table if not exists public.technicians (
  user_id uuid primary key references auth.users(id) on delete cascade,
  skills jsonb not null default '[]'::jsonb,
  service_cities jsonb not null default '[]'::jsonb,
  hourly_rate bigint,
  bio text,
  rating_avg numeric(3,2) not null default 0,
  jobs_completed int not null default 0,
  is_active boolean not null default true,
  kyc_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.technicians enable row level security;

drop policy if exists "public reads technicians" on public.technicians;
create policy "public reads technicians" on public.technicians for select using (true);

drop policy if exists "tech upserts self" on public.technicians;
create policy "tech upserts self" on public.technicians for insert
  with check (user_id = auth.uid() and public.has_role(auth.uid(),'maintenance'));

drop policy if exists "tech updates self" on public.technicians;
create policy "tech updates self" on public.technicians for update
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create or replace function public._recompute_tech_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.technicians t
    set rating_avg = coalesce((
      select round(avg(stars)::numeric, 2)
      from public.maintenance_reviews
      where ratee_id = t.user_id and direction in ('tenant_to_tech','landlord_to_tech')
    ), 0)
    where t.user_id = new.ratee_id;
  return new;
end $$;

drop trigger if exists trg_recompute_tech_rating on public.maintenance_reviews;
create trigger trg_recompute_tech_rating
  after insert on public.maintenance_reviews
  for each row execute function public._recompute_tech_rating();
