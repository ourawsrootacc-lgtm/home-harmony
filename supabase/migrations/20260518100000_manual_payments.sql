-- Phase 2: Manual payments (bank/EasyPaisa/JazzCash) + notification triggers.
-- Idempotent. Safe to re-run.

-- 1. Storage bucket
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- 2. payment_methods
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bank','easypaisa','jazzcash','cash')),
  account_title text not null,
  account_number text,
  bank_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists payment_methods_user_idx on public.payment_methods(user_id);
alter table public.payment_methods enable row level security;
drop policy if exists "owner manages own methods" on public.payment_methods;
create policy "owner manages own methods" on public.payment_methods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "authenticated read methods" on public.payment_methods;
create policy "authenticated read methods" on public.payment_methods
  for select using (auth.uid() is not null);

-- 3. payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  context text not null check (context in ('rent','deposit','maintenance','late_fee','cancellation_fee','other')),
  lease_id uuid references public.leases(id) on delete set null,
  ticket_id uuid references public.maintenance_tickets(id) on delete set null,
  quote_id uuid references public.maintenance_quotes(id) on delete set null,
  payer_id uuid not null references auth.users(id) on delete cascade,
  payee_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount > 0),
  currency text not null default 'PKR',
  method text not null check (method in ('bank','easypaisa','jazzcash','cash')),
  proof_url text,
  reference_no text,
  paid_at timestamptz,
  notes text,
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected','disputed','refund_requested')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  dispute_reason text,
  auto_approve_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_payer_idx on public.payments(payer_id, created_at desc);
create index if not exists payments_payee_idx on public.payments(payee_id, created_at desc);
create index if not exists payments_lease_idx on public.payments(lease_id);
create index if not exists payments_ticket_idx on public.payments(ticket_id);
create unique index if not exists payments_dedupe_ref
  on public.payments(method, reference_no)
  where reference_no is not null and method <> 'cash';

alter table public.payments enable row level security;
drop policy if exists "parties read payments" on public.payments;
create policy "parties read payments" on public.payments for select using (
  auth.uid() in (payer_id, payee_id) or public.has_role(auth.uid(),'admin')
);
drop policy if exists "payer creates payment" on public.payments;
create policy "payer creates payment" on public.payments for insert
  with check (auth.uid() = payer_id);
drop policy if exists "parties update payment" on public.payments;
create policy "parties update payment" on public.payments for update using (
  auth.uid() in (payer_id, payee_id) or public.has_role(auth.uid(),'admin')
);

-- Tamper protection
create or replace function public._payments_lock_immutable_fields()
returns trigger language plpgsql as $$
begin
  if old.status <> 'submitted' then
    if new.amount is distinct from old.amount
       or new.proof_url is distinct from old.proof_url
       or new.reference_no is distinct from old.reference_no
       or new.method is distinct from old.method then
      raise exception 'Cannot modify proof/amount/reference after submission';
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists trg_payments_lock on public.payments;
create trigger trg_payments_lock before update on public.payments
  for each row execute function public._payments_lock_immutable_fields();

-- Auto-set auto_approve_at on insert
create or replace function public._payments_set_auto_approve()
returns trigger language plpgsql as $$
begin
  if new.auto_approve_at is null then
    new.auto_approve_at = now() + interval '48 hours';
  end if;
  return new;
end $$;
drop trigger if exists trg_payments_auto_approve on public.payments;
create trigger trg_payments_auto_approve before insert on public.payments
  for each row execute function public._payments_set_auto_approve();

-- 4. payment_events
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  actor_id uuid references auth.users(id),
  actor_role text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payment_events_idx on public.payment_events(payment_id, created_at desc);
alter table public.payment_events enable row level security;
drop policy if exists "parties read payment events" on public.payment_events;
create policy "parties read payment events" on public.payment_events for select using (
  exists (
    select 1 from public.payments p where p.id = payment_id
    and (auth.uid() in (p.payer_id, p.payee_id) or public.has_role(auth.uid(),'admin'))
  )
);

create or replace function public._log_payment_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.payment_events (payment_id, actor_id, event_type, payload)
    values (new.id, new.payer_id, 'payment_submitted',
            jsonb_build_object('amount', new.amount, 'method', new.method, 'context', new.context));
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.payment_events (payment_id, actor_id, event_type, payload)
    values (new.id, auth.uid(), 'status_' || new.status,
            jsonb_build_object('from', old.status, 'to', new.status,
                               'reason', coalesce(new.rejection_reason, new.dispute_reason)));
  end if;
  return new;
end $$;
drop trigger if exists trg_log_payment on public.payments;
create trigger trg_log_payment after insert or update on public.payments
  for each row execute function public._log_payment_change();

-- 5. Storage RLS for payment-proofs
drop policy if exists "payer uploads own proof" on storage.objects;
create policy "payer uploads own proof" on storage.objects for insert
  with check (bucket_id = 'payment-proofs' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "parties read proof" on storage.objects;
create policy "parties read proof" on storage.objects for select using (
  bucket_id = 'payment-proofs' and (
    auth.uid()::text = (storage.foldername(name))[1]
    or exists (
      select 1 from public.payments p
      where p.proof_url like '%' || name || '%'
        and (auth.uid() in (p.payer_id, p.payee_id) or public.has_role(auth.uid(),'admin'))
    )
  )
);

-- 6. Notifications extension
alter table public.notifications
  add column if not exists link text,
  add column if not exists severity text not null default 'info'
    check (severity in ('info','warn','critical')),
  add column if not exists dedupe_key text,
  add column if not exists seen_at timestamptz;
create unique index if not exists notifications_dedupe
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

create or replace function public.emit_notification(
  _user_id uuid, _kind text, _title text, _body text,
  _link text default null, _severity text default 'info', _dedupe_key text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if _user_id is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, severity, dedupe_key)
  values (_user_id, _kind, _title, _body, _link, _severity, _dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- 7. Notification triggers
create or replace function public._notify_ticket_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_landlord uuid;
begin
  select landlord_id into v_landlord from public.properties where id = new.property_id;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  perform public.emit_notification(new.tenant_id, 'maintenance_status',
    'Ticket ' || new.status, 'Your ticket is now ' || new.status,
    '/app/tenant/maintenance', 'info', 'ticket:' || new.id || ':' || new.status);
  perform public.emit_notification(v_landlord, 'maintenance_status',
    'Ticket ' || new.status, 'Ticket on your property is now ' || new.status,
    '/app/landlord/maintenance', 'info', 'ticket:' || new.id || ':' || new.status || ':L');
  if new.assigned_to is not null then
    perform public.emit_notification(new.assigned_to, 'maintenance_status',
      'Job ' || new.status, 'Job is now ' || new.status,
      '/app/maintenance', 'info', 'ticket:' || new.id || ':' || new.status || ':T');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_ticket on public.maintenance_tickets;
create trigger trg_notify_ticket after insert or update on public.maintenance_tickets
  for each row execute function public._notify_ticket_status();

create or replace function public._notify_quote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_landlord uuid;
begin
  select t.tenant_id, p.landlord_id into v_tenant, v_landlord
  from public.maintenance_tickets t
  left join public.properties p on p.id = t.property_id
  where t.id = new.ticket_id;
  if tg_op = 'INSERT' then
    if new.created_by_role = 'technician' then
      perform public.emit_notification(v_tenant, 'quote_received',
        'New quote', 'PKR ' || new.price::text || ' — review and respond.',
        '/app/tenant/maintenance', 'info', 'quote:' || new.id || ':new:T');
      perform public.emit_notification(v_landlord, 'quote_received',
        'New quote', 'Technician quoted PKR ' || new.price::text,
        '/app/landlord/maintenance', 'info', 'quote:' || new.id || ':new:L');
    else
      perform public.emit_notification(new.technician_id, 'quote_received',
        'Counter-quote', 'PKR ' || new.price::text,
        '/app/maintenance', 'info', 'quote:' || new.id || ':counter');
    end if;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.emit_notification(new.technician_id, 'quote_' || new.status,
      'Quote ' || new.status, 'Your quote was ' || new.status,
      '/app/maintenance', case when new.status='accepted' then 'info' else 'warn' end,
      'quote:' || new.id || ':' || new.status);
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_quote on public.maintenance_quotes;
create trigger trg_notify_quote after insert or update on public.maintenance_quotes
  for each row execute function public._notify_quote();

create or replace function public._notify_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_notification(new.technician_id, 'assignment_offered',
      'New job offer', 'A maintenance job is available — accept before it expires.',
      '/app/maintenance', 'warn', 'assignment:' || new.id || ':offered');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_assignment on public.maintenance_assignments;
create trigger trg_notify_assignment after insert on public.maintenance_assignments
  for each row execute function public._notify_assignment();

create or replace function public._notify_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_notification(new.payee_id, 'payment_submitted',
      'Payment proof submitted',
      'PKR ' || new.amount::text || ' for ' || new.context || ' — please review.',
      case
        when public.has_role(new.payee_id,'landlord') then '/app/landlord/payments'
        when public.has_role(new.payee_id,'maintenance') then '/app/maintenance'
        else '/app/tenant/payments'
      end, 'warn', 'payment:' || new.id || ':submitted');
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.emit_notification(new.payer_id, 'payment_' || new.status,
      'Payment ' || new.status, coalesce(new.rejection_reason, 'Status: ' || new.status),
      '/app/tenant/payments',
      case when new.status in ('rejected','disputed') then 'critical' else 'info' end,
      'payment:' || new.id || ':' || new.status);
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_payment on public.payments;
create trigger trg_notify_payment after insert or update on public.payments
  for each row execute function public._notify_payment();

-- 8. Lease payment summary view
create or replace view public.lease_payment_summary
with (security_invoker = on) as
select
  l.id as lease_id,
  l.tenant_id,
  l.landlord_id,
  l.monthly_rent,
  coalesce(sum(p.amount) filter (where p.status = 'approved'), 0) as total_paid,
  count(p.id) filter (where p.status = 'submitted') as pending_count
from public.leases l
left join public.payments p on p.lease_id = l.id and p.context = 'rent'
group by l.id;
