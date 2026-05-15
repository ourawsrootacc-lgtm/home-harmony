## Root cause

Same bug as the earlier `PropertyDetail.tsx` issue — a PostgREST embedded join on a relationship that does not exist as a foreign key.

In `src/pages/landlord/Applications.tsx` (line ~26):

```ts
supabase.from("applications")
  .select("*, properties!inner(id,title,landlord_id), profiles:tenant_id(full_name,phone)")
  .eq("properties.landlord_id", user.id)
```

- `applications.tenant_id` references **`auth.users(id)`** (see `db/migrations/0003_applications_leases.sql`), NOT `public.profiles(id)`.
- PostgREST therefore cannot resolve the `profiles:tenant_id(...)` embed → the WHOLE query errors → `data` is `null` → `rows` stays `[]` → the page shows **"No applications yet"** even though the row clearly exists in the `applications` table (your screenshot confirms it).

The `properties!inner(...)` part is fine because `applications.property_id` does have a real FK to `properties.id`.

This is identical in shape to the bug we fixed in `PropertyDetail.tsx`. The same pattern likely exists in any other page that tries to embed `profiles` off a user-id column.

## Fix — one file

**File to edit in your local VS Code:**
`src/pages/landlord/Applications.tsx`

Replace the data-loading block: drop the `profiles:tenant_id(...)` embed, fetch tenant profiles in a second query, and merge in JS. No DB / migration change needed (the `profiles` table already has a permissive SELECT policy).

### Replace the `load` function

```tsx
const load = async () => {
  if (!user) return;
  setLoading(true);

  // 1. Applications + their property (FK exists, embed is safe)
  const { data: apps, error } = await supabase
    .from("applications")
    .select("*, properties!inner(id,title,landlord_id)")
    .eq("properties.landlord_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("applications fetch error:", error);
    setRows([]);
    setLoading(false);
    return;
  }

  // 2. Fetch tenant profiles in a second call and merge
  const tenantIds = Array.from(new Set((apps ?? []).map((a) => a.tenant_id)));
  let profilesById: Record<string, { full_name: string | null; phone: string | null }> = {};
  if (tenantIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", tenantIds);
    profilesById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
  }

  setRows(
    (apps ?? []).map((a) => ({ ...a, profiles: profilesById[a.tenant_id] ?? null }))
  );
  setLoading(false);
};
useEffect(() => { load(); }, [user]);
```

The rest of the JSX (which reads `r.profiles?.full_name` and `r.profiles?.phone`) stays exactly the same.

## Why this works

- Removes the unsupported PostgREST embed (`profiles:tenant_id`) that was killing the request.
- The applications + property embed still works because that FK is real.
- Tenant names/phones load via a normal `profiles` SELECT (allowed by your existing "profiles readable by all" policy).
- No schema change, no migration — pure code edit you can paste into your local copy.

## Other places to check (same bug pattern)

Quickly scan these for the same `profiles:<user_id_column>(...)` embed and apply the same split-query fix if present:

- `src/pages/tenant/Applications.tsx` — if it embeds landlord profile via properties
- `src/pages/admin/Complaints.tsx` — if it embeds reporter/target profiles
- `src/pages/shared/Messages.tsx` — if it embeds sender/recipient profiles
- `src/pages/maintenance/Dashboard.tsx` — if it embeds tenant profiles

If you want, I can audit those files and produce the same drop-in patches in the build step.

## Optional permanent fix (not required for the demo)

Add a real FK so PostgREST learns the relationship and the original embed style works everywhere:

```sql
alter table public.profiles
  add constraint profiles_id_fkey_users
  foreign key (id) references auth.users(id) on delete cascade;
-- (profiles.id already equals auth.users.id by convention; this just makes it explicit
--  so PostgREST can traverse applications.tenant_id → auth.users.id → profiles.id.)
```

But the code patch above is enough — no DB work needed for your evaluator demo.
