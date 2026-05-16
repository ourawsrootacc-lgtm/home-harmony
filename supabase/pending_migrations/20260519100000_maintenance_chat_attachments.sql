-- Phase 3: ticket-scoped chat, real photo/file attachments, payment-gated close.
-- COPY THIS FILE TO: supabase/migrations/20260519100000_maintenance_chat_attachments.sql
-- then run: npx supabase db push
-- Idempotent.

-- 1. Storage bucket for maintenance attachments (private)
insert into storage.buckets (id, name, public)
values ('maintenance-attachments', 'maintenance-attachments', false)
on conflict (id) do nothing;

-- helper: is current user a party on this ticket?
create or replace function public._is_ticket_party(_ticket_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.maintenance_tickets t
    left join public.properties p on p.id = t.property_id
    where t.id = _ticket_id
      and (
        t.tenant_id = auth.uid()
        or p.landlord_id = auth.uid()
        or t.assigned_to = auth.uid()
        or public.has_role(auth.uid(), 'admin')
      )
  );
$$;

-- 2. maintenance_attachments
create table if not exists public.maintenance_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_tickets(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('issue','after','invoice','other')),
  storage_path text not null,
  mime text,
  created_at timestamptz not null default now()
);
create index if not exists maintenance_attachments_ticket_idx
  on public.maintenance_attachments(ticket_id, created_at desc);

alter table public.maintenance_attachments enable row level security;

drop policy if exists "parties read attachments" on public.maintenance_attachments;
create policy "parties read attachments" on public.maintenance_attachments
  for select using (public._is_ticket_party(ticket_id));

drop policy if exists "parties upload attachments" on public.maintenance_attachments;
create policy "parties upload attachments" on public.maintenance_attachments
  for insert with check (uploaded_by = auth.uid() and public._is_ticket_party(ticket_id));

drop policy if exists "uploader deletes own attachment" on public.maintenance_attachments;
create policy "uploader deletes own attachment" on public.maintenance_attachments
  for delete using (uploaded_by = auth.uid() or public.has_role(auth.uid(),'admin'));

-- storage RLS: paths look like "<ticket_id>/<uploader>/<filename>"
drop policy if exists "ticket party reads attachment" on storage.objects;
create policy "ticket party reads attachment" on storage.objects for select using (
  bucket_id = 'maintenance-attachments'
  and public._is_ticket_party(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "ticket party uploads attachment" on storage.objects;
create policy "ticket party uploads attachment" on storage.objects for insert with check (
  bucket_id = 'maintenance-attachments'
  and public._is_ticket_party(((storage.foldername(name))[1])::uuid)
  and auth.uid()::text = (storage.foldername(name))[2]
);

-- 3. maintenance_messages (ticket-scoped chat)
create table if not exists public.maintenance_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists maintenance_messages_ticket_idx
  on public.maintenance_messages(ticket_id, created_at);

alter table public.maintenance_messages enable row level security;

drop policy if exists "parties read messages" on public.maintenance_messages;
create policy "parties read messages" on public.maintenance_messages
  for select using (public._is_ticket_party(ticket_id));

drop policy if exists "parties send messages" on public.maintenance_messages;
create policy "parties send messages" on public.maintenance_messages
  for insert with check (sender_id = auth.uid() and public._is_ticket_party(ticket_id));

-- enable realtime (ignore if already in publication)
do $$ begin
  alter publication supabase_realtime add table public.maintenance_messages;
exception when duplicate_object then null; when others then null; end $$;

-- notify other parties on new chat message (deduped per minute)
create or replace function public._notify_ticket_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_landlord uuid; v_tech uuid; v_minute text;
begin
  select t.tenant_id, p.landlord_id, t.assigned_to
    into v_tenant, v_landlord, v_tech
  from public.maintenance_tickets t
  left join public.properties p on p.id = t.property_id
  where t.id = new.ticket_id;
  v_minute := to_char(date_trunc('minute', new.created_at), 'YYYYMMDDHH24MI');

  if v_tenant is not null and v_tenant <> new.sender_id then
    perform public.emit_notification(v_tenant, 'ticket_message',
      'New message on your ticket', left(new.body, 120),
      '/app/tenant/maintenance', 'info',
      'tmsg:' || new.ticket_id || ':' || new.sender_id || ':' || v_minute || ':T');
  end if;
  if v_landlord is not null and v_landlord <> new.sender_id then
    perform public.emit_notification(v_landlord, 'ticket_message',
      'New message on a ticket', left(new.body, 120),
      '/app/landlord/maintenance', 'info',
      'tmsg:' || new.ticket_id || ':' || new.sender_id || ':' || v_minute || ':L');
  end if;
  if v_tech is not null and v_tech <> new.sender_id then
    perform public.emit_notification(v_tech, 'ticket_message',
      'New message on your job', left(new.body, 120),
      '/app/maintenance', 'info',
      'tmsg:' || new.ticket_id || ':' || new.sender_id || ':' || v_minute || ':M');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_ticket_message on public.maintenance_messages;
create trigger trg_notify_ticket_message after insert on public.maintenance_messages
  for each row execute function public._notify_ticket_message();

-- 4. Payment-gated close: when a maintenance payment is approved and the ticket
--    is tenant_verified, auto-close the ticket.
create or replace function public._maybe_close_on_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.context = 'maintenance' and new.ticket_id is not null
     and new.status = 'approved' and (old.status is distinct from 'approved') then
    update public.maintenance_tickets
      set status = 'closed', closed_at = now()
      where id = new.ticket_id and status = 'tenant_verified';
  end if;
  return new;
end $$;
drop trigger if exists trg_maybe_close_on_payment on public.payments;
create trigger trg_maybe_close_on_payment after update on public.payments
  for each row execute function public._maybe_close_on_payment();
