## Problem

Your local `supabase db push` fails on `20260523100000_property_society_and_marlas.sql` at step 3:

```
ERROR: check constraint "properties_city_check" of relation "properties" is violated by some row
```

Your local DB has seeded properties in cities outside the supported five (Rawalpindi, Faisalabad, plus any others from `scripts/seed.mjs`). The constraint refuses to apply while those rows exist.

## Fix

Update the migration to **normalize/remove unsupported-city rows before adding the constraint**, so it's idempotent and safe on any database (local seeded, fresh, or production).

Edit `supabase/pending_migrations/20260523100000_property_society_and_marlas.sql` — in step 3, before the `ADD CONSTRAINT`, delete properties whose city isn't in the allowed five. Cascading FKs (applications, leases, favorites, maintenance_tickets, property_images) will clean up dependents.

```sql
-- 3. Restrict city to the 5 supported cities.
alter table public.properties
  drop constraint if exists properties_city_check;

-- Remove legacy rows for unsupported cities so the new check can apply.
delete from public.properties
 where city not in ('Karachi','Lahore','Islamabad','Peshawar','Quetta');

alter table public.properties
  add constraint properties_city_check
  check (city in ('Karachi','Lahore','Islamabad','Peshawar','Quetta'));
```

## Re-run locally

```bash
supabase db push
```

The earlier partial run already added `society`, `area_marlas`, the trigger, and dropped the NOT NULL on `area_sqft`, so the migration's `if not exists` / `drop ... if exists` guards make a re-run safe.

If `db push` still says "already applied" but the constraint isn't there, mark the migration as reverted and retry:

```bash
supabase migration repair --status reverted 20260523100000
supabase db push
```

## Note on seed data

`scripts/seed.mjs` still inserts Rawalpindi and Faisalabad properties — those inserts will now fail after the constraint is in place. I'll also trim that seed list to the five supported cities so `node scripts/seed.mjs` keeps working.
