## Problem

`src/pages/public/PropertyDetail.tsx` uses an embedded PostgREST join:

```ts
supabase
  .from("properties")
  .select("*, profiles:landlord_id(full_name, phone)")
  .eq("id", id)
  .maybeSingle()
```

But in `db/migrations/0002_properties.sql`, `properties.landlord_id` references `auth.users(id)`, not `public.profiles(id)`. PostgREST has no FK between `properties` and `profiles`, so the embed fails, the request errors, `prop` is `null`, and the page renders **"Property not found."** for every listing.

Browse works because it doesn't join `profiles`.

## Fix (one file, no DB changes)

Edit `src/pages/public/PropertyDetail.tsx` — fetch the property first, then fetch the landlord's profile in a second call. Both `properties` and `profiles` already have permissive SELECT RLS, so this works without any migration.

### Replace the data-loading block

```tsx
useEffect(() => {
  if (!isSupabaseConfigured || !id) { setLoading(false); return; }

  (async () => {
    const { data: prop, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) console.error("property fetch error:", error);

    if (prop) {
      const [{ data: imgs }, { data: profile }] = await Promise.all([
        supabase.from("property_images")
          .select("url,sort_order")
          .eq("property_id", id)
          .order("sort_order"),
        supabase.from("profiles")
          .select("full_name, phone")
          .eq("id", prop.landlord_id)
          .maybeSingle(),
      ]);
      setP({ ...prop, profiles: profile ?? null });
      setImages(imgs ?? []);
    }
    setLoading(false);
  })();
}, [id]);
```

The rest of the file (JSX reading `p.profiles?.full_name` / `p.profiles?.phone`) stays exactly the same.

## Why this works

- Removes the unsupported PostgREST embed.
- Property row loads on its own → page renders.
- Landlord name/phone load via a normal `profiles` SELECT (allowed by `"profiles readable by all"` policy).
- No migration, no schema change — drop-in code edit you can paste into your local VS Code copy.

## Optional follow-up (not required)

If you'd rather restore the embed style long-term, add this migration so PostgREST learns the relationship:

```sql
alter table public.properties
  add constraint properties_landlord_profile_fkey
  foreign key (landlord_id) references public.profiles(id) on delete cascade;
```

Then the original `select("*, profiles:landlord_id(...)")` would also work. But the code fix above is enough for your demo.