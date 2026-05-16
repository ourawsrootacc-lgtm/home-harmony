## Why nothing is changing on your Supabase

`npx supabase db push` reads **only** `supabase/migrations/`. Earlier work created the lease-lifecycle SQL in a second folder, `db/migrations/`, which the CLI ignores. Result:

- `db/migrations/0007_lease_lifecycle.sql` — already mirrored into `supabase/migrations/20260516120006_lease_lifecycle.sql` (identical hash). If your last `db push` ran after this commit, it's already applied. If your dashboard still has no `end_reason` column, you simply haven't pushed since then.
- `db/migrations/0008_lease_lifecycle_mutual.sql` — **NOT mirrored anywhere the CLI sees.** This is the migration that adds `lease_requests`, `lease_inspections`, the mutual-approval triggers, and the missing-column fixes. The TypeScript I added to `src/lib/lease.ts` and `src/components/lease/LeaseLifecyclePanel.tsx` depends on it.

Going forward I will write migrations directly into `supabase/migrations/` so this can't happen again.

## Plan

### Step 1 — Mirror migration `0008` into the folder the CLI uses
Copy `db/migrations/0008_lease_lifecycle_mutual.sql` to:

```
supabase/migrations/20260516120007_lease_lifecycle_mutual.sql
```

Timestamp prefix `20260516120007` keeps it strictly after the existing `…120006_lease_lifecycle.sql` so the CLI applies them in the correct order.

Content is copied verbatim — the SQL is already idempotent (`create table if not exists`, `add column if not exists`, `drop trigger if exists`/`create trigger`, `do $$ ... $$` guards on enum values). Safe to re-run even if parts of `0007` were never pushed.

### Step 2 — Delete the stale parallel folder
Remove `db/migrations/` entirely so there is exactly one source of truth (`supabase/migrations/`). This prevents the same drift bug in the future and removes confusion about which folder is "real".

### Step 3 — Document the workflow in the repo
Add a short `supabase/migrations/README.md` with the exact commands you already use:

```
git pull
npx supabase db push
npm run dev
```

…and a one-liner rule: *all new migrations go in this folder only.*

### Step 4 — Your manual step
After I land Steps 1–3 and you `git pull`, run:

```
npx supabase db push
```

You should see one new migration applied: `20260516120007_lease_lifecycle_mutual`. After that:

- The `end_reason`, `notice_period_days`, etc. columns will exist (fixes the dashboard errors).
- The `lease_requests` table will exist (powers the mutual amend / extend / renew / terminate flow).
- The `LeaseLifecyclePanel` on both landlord and tenant pages will stop throwing.

### Out of scope for this plan
- No application/UI code changes — `lease.ts` and `LeaseLifecyclePanel.tsx` are already in place from the previous turn and match this schema.
- No data backfill — existing leases keep their current state.
- Not connecting Lovable Cloud — you've chosen to keep your own Supabase project; I'll keep writing migrations into `supabase/migrations/` for you to push.

### Technical notes
- The two migration folders existed because the earlier scaffold treated `db/migrations/` as a "design doc" location and `supabase/migrations/` as the CLI target, but only the first six files were ever mirrored. Collapsing to one folder eliminates the class of bug.
- Mirroring (not moving) `0008` keeps the existing file path stable in case any older chat reference points to it; Step 2 then removes the now-redundant `db/` copy in the same change so we're not left with duplicates.
- If `npx supabase db push` reports `migration 20260516120006_lease_lifecycle already applied`, that's expected — only `…120007_lease_lifecycle_mutual` should be new for you.
