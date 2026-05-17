# Fix delete error + remove demo data

## Root cause

Clicking the red trash icon on `/app/landlord/listings` calls `delete from properties`. The cascade then deletes rows from `property_documents`, which fires this trigger from `supabase/migrations/20260520100000_documents.sql`:

```sql
create trigger property_documents_delete_storage
  before delete on public.property_documents
  for each row execute function public.delete_property_doc_storage();
-- function body: delete from storage.objects where ...
```

Lovable Cloud's managed Postgres blocks any direct write to `storage.objects` ("Direct deletion from storage tables is not allowed. Use the Storage API instead."), so the whole transaction aborts and the listing is never deleted. The sibling `application_documents_delete_storage` trigger has the same problem.

## Fix

### 1. New migration: drop the storage-touching triggers

`supabase/pending_migrations/20260524100000_drop_doc_storage_triggers.sql`

```sql
drop trigger if exists application_documents_delete_storage on public.application_documents;
drop trigger if exists property_documents_delete_storage   on public.property_documents;
drop function if exists public.delete_app_doc_storage();
drop function if exists public.delete_property_doc_storage();
```

Storage cleanup moves to app code, which is the documented Lovable Cloud pattern.

### 2. App-side cleanup before delete (`src/pages/landlord/Listings.tsx`)

Rewrite `remove(id)` so it:

1. Loads `property_images(url)` and `property_documents(storage_path)` for the property.
2. Derives storage object paths:
   - For `property-images`: parse the public URL → take the segment after `/object/public/property-images/`.
   - For `documents`: use `storage_path` directly.
3. Calls `supabase.storage.from('property-images').remove(paths)` and `supabase.storage.from('documents').remove(paths)` (ignore "not found" errors so a missing file doesn't block the delete).
4. Then `supabase.from('properties').delete().eq('id', id)`.
5. Toasts success/failure and reloads.

No other UI changes.

### 3. Wipe demo data (run via DB tool, not a migration)

Demo emails seeded by `scripts/seed.mjs`:
- `admin@homerentals.pk`
- `landlord@homerentals.pk`
- `tenant@homerentals.pk`
- `maintenance@homerentals.pk`

Plan: `delete from auth.users where email in (...)`. FK cascades clean up `profiles`, `user_roles`, `properties` (and through them `property_images`, `applications`, `leases`, `maintenance_tickets`, `favorites`, `property_documents`), `messages`, `notifications`, `complaints`.

Before deleting users we'll also clear leftover storage objects in their folders via the same Storage API approach (best-effort; managed UI also lets the user clean buckets).

Also delete the demo listing currently visible on screen ("Studio in F-7 Markaz") which belongs to the demo landlord — covered by the cascade above.

### 4. Stop re-seeding demo data

Update `scripts/seed.mjs` so it is a no-op by default (exit early with a message: "Demo seeding disabled. Set SEED_DEMO=1 to enable."). This prevents accidental re-creation of the four demo accounts on future local runs.

## Files touched

- `supabase/pending_migrations/20260524100000_drop_doc_storage_triggers.sql` (new)
- `src/pages/landlord/Listings.tsx` (rewrite `remove`)
- `scripts/seed.mjs` (gate behind `SEED_DEMO=1`)
- DB cleanup: SQL run via the migration/insert tool to remove the four demo users and their data.

## Verification

1. Apply migration → trash icon on the remaining real listing succeeds with no error toast.
2. After demo wipe → `/app/landlord/listings` (logged in as a real landlord) no longer shows demo listings; `/browse` no longer shows demo properties.
3. `node scripts/seed.mjs` prints the disabled message instead of inserting users.
