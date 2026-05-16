-- 0005 — complaints, messages, notifications
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null, target_id uuid,
  description text not null, status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.complaints enable row level security;
create policy "reporter sees own complaints" on public.complaints for select using (auth.uid() = reporter_id);
create policy "admin sees all complaints" on public.complaints for select using (public.has_role(auth.uid(),'admin'));
create policy "users file complaints" on public.complaints for insert with check (auth.uid() = reporter_id);
create policy "admin updates complaints" on public.complaints for update using (public.has_role(auth.uid(),'admin'));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null, read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "participants read" on public.messages for select using (auth.uid() in (sender_id, recipient_id));
create policy "sender writes" on public.messages for insert with check (auth.uid() = sender_id);
create policy "recipient marks read" on public.messages for update
  using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, title text not null, body text,
  read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "users read own notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "users mark own notifications" on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admin/system write notifications" on public.notifications for insert
  with check (public.has_role(auth.uid(),'admin') or auth.uid() = user_id);
