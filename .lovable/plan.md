## Issue 1 — City dropdown doesn't apply selection

**Root cause:** In `src/pages/public/Browse.tsx`, the city `<Select>` calls `update("city", ...)` then `update("society", "")` back-to-back. Each `update` reads the same stale `params` snapshot and calls `setParams`, so the second call overwrites the first — the new city is lost and the URL only clears `society`. Result: the dropdown visually reverts to "All cities".

**Fix:** Replace the two sequential `update` calls in the city `onValueChange` with a single `setParams` call that mutates one fresh `URLSearchParams` (sets/deletes `city` and clears `society` together). No other logic changes.

```ts
onValueChange={(v) => {
  const p = new URLSearchParams(params);
  if (v && v !== "all") p.set("city", v); else p.delete("city");
  p.delete("society");
  setParams(p, { replace: true });
}}
```

## Issue 2 — Remove every trace of Lovable

Audit found Lovable references in these files only (no `lovable-tagger` plugin, no badges, no Lovable scripts in `index.html`):

| File | Action |
| --- | --- |
| `.lovable/` folder (contains `plan.md`) | **Delete entire folder** |
| `bunfig.toml` line `minimumReleaseAgeExcludes = ["@lovable.dev/vite-tanstack-config"]` | Remove the line (keep the rest of the file) |
| `LOCAL_SETUP.md` — "After any change made in Lovable…" and the entire "Going production-clean" section mentioning strip-lovable | Rewrite those two spots so they read as a normal local-dev workflow with no Lovable wording |
| `src/pages/landlord/Listings.tsx` line 31 comment | Reword comment to drop "Lovable Cloud" (just say "Supabase storage doesn't allow…") |
| `supabase/pending_migrations/20260524100000_drop_doc_storage_triggers.sql` header comment | Reword to drop "Lovable Cloud" |
| `supabase/pending_migrations/20260524110000_remove_demo_accounts.sql` line 11 comment | Reword to drop "Lovable Cloud" |

Not touched (intentional):
- `bun.lock` and `.workspace/.git/config` — internal artifacts not shipped to evaluators; `bun.lock` only mentions the excluded package name and rewriting it would force a reinstall with no user-visible benefit. If you want a 100% clean lockfile too, say the word and I'll regenerate it.
- `package.json`, `vite.config.ts`, `index.html`, `README.md`, `src/main.tsx` — already clean.

## Verification after implementation

1. Open `/browse`, pick **Peshawar** → URL becomes `?city=Peshawar`, the dropdown shows "Peshawar", listings filter, and the Society dropdown appears.
2. `grep -ril lovable .` (excluding `bun.lock` and `.workspace/`) returns zero matches.
3. `.lovable/` directory no longer exists.
4. App still builds and runs (`npm run dev`).
