# WhatsApp-style attachments in Messages (images + files)

## Schema — `supabase/pending_migrations/<ts>_message_attachments.sql`

```sql
alter table public.messages
  add column kind text not null default 'text'
    check (kind in ('text','image','file')),
  add column attachment_path text,
  add column attachment_name text,
  add column attachment_size bigint,
  add column attachment_mime text;

insert into storage.buckets (id, name, public)
values ('message-attachments','message-attachments', false)
on conflict (id) do nothing;
```

Storage RLS on `storage.objects` for bucket `message-attachments`:
- INSERT: `auth.uid()::text = (storage.foldername(name))[1]` (sender uploads under own prefix).
- SELECT: `auth.uid()` is sender or recipient of any `messages` row where `attachment_path = name`.
- DELETE: sender only.

## Frontend

### `src/lib/messageAttachments.ts` (new)
- `uploadMessageAttachment(file)` → `{ path, name, size, mime }` (path `${user.id}/${crypto.randomUUID()}-${safeName}`)
- `getMessageAttachmentUrl(path)` → signed URL (1 h)
- Validators: max 20 MB; image MIMEs vs generic file; reject executables (`.exe`, `.bat`, `.sh`, `.cmd`, `.msi`).

### `src/pages/shared/Messages.tsx`
- Composer toolbar adds two buttons:
  - **Image** (📷) — `accept="image/*"`, multi-select
  - **File** (📎) — anything except blocked MIMEs
- Pending-upload chips below textarea (filename + size + ✕ to cancel) before send.
- On Send: upload each file, insert one `messages` row per attachment with `kind` + metadata. Text in the textarea sends as a separate `kind='text'` row.
- Bubble renderer switches on `kind`:
  - `text` — current behaviour
  - `image` — thumbnail (signed URL, lazy-loaded), click → open full size in new tab; download button
  - `file` — icon + filename + size + download button
- Thread list "last message" preview shows "📷 Photo" or "📎 Filename" for non-text last messages.

### Realtime
No changes — the existing INSERT subscription already covers attachment rows.

## Out of scope
Voice messages, location sharing, multi-file zip, image cropping, E2E encryption.

## Acceptance
1. Image button → pick → preview chip → Send → recipient sees thumbnail and can download.
2. File button → pick PDF → recipient sees file card with name + size + download.
3. Files are private: third party with the path cannot read them.
4. Thread list shows correct "📷/📎" preview for the latest message.
5. Existing text messages keep working.

Confirm and I'll implement.
