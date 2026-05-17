-- WhatsApp-style attachments on direct messages.
-- Adds typed message kinds + private storage bucket with sender/recipient-scoped RLS.

alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text','image','file')),
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_mime text;

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

-- Sender uploads under their own uid prefix.
drop policy if exists "msg-attach-insert" on storage.objects;
create policy "msg-attach-insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Either party of a message that references the path may read it.
drop policy if exists "msg-attach-select" on storage.objects;
create policy "msg-attach-select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.messages m
      where m.attachment_path = storage.objects.name
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

-- Only the original uploader may delete.
drop policy if exists "msg-attach-delete" on storage.objects;
create policy "msg-attach-delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
