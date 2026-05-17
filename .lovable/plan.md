## Problem

`npx supabase db push` fails on the cleanup migration `20260524110000_remove_demo_accounts.sql`:

```
ERROR: update or delete on table "users" violates foreign key constraint
       "lease_signatures_user_id_fkey" on table "lease_signatures"
```

Root cause: `public.lease_signatures.user_id` references `auth.users(id)` **without** `ON DELETE CASCADE` (see `supabase/migrations/20260516120006_lease_lifecycle.sql` line 65). The demo landlord/tenant signed lease versions, so deleting their `auth.users` row is blocked.

Other tables (profiles, user_roles, properties, leases, etc.) cascade fine; only `lease_signatures` (and potentially a few other non-cascading FKs) block the delete.

## Fix

Update `supabase/pending_migrations/20260524110000_remove_demo_accounts.sql` to explicitly purge rows that reference the demo users via non-cascading FKs **before** the `delete from auth.users`:

```sql
with demo as (
  select id from auth.users
  where email in (
    'admin@homerentals.pk','landlord@homerentals.pk',
    'tenant@homerentals.pk','maintenance@homerentals.pk'
  )
)
delete from public.lease_signatures
 where user_id in (select id from demo);

delete from auth.users
 where email in (
   'admin@homerentals.pk','landlord@homerentals.pk',
   'tenant@homerentals.pk','maintenance@homerentals.pk'
 );
```

This keeps the cascade-based cleanup for everything else and only manually clears the one FK that lacks `ON DELETE CASCADE`.

## Verify

Re-run `npx supabase db push` locally — the migration should apply cleanly and the four demo accounts disappear.

If push still reports it as already applied/failed, run:
```
npx supabase migration repair --status reverted 20260524110000
npx supabase db push
```