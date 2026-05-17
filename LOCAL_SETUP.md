# Local Setup — HomeRentals

Fast iteration workflow. Do the one-time steps once, then it's two commands per update.

## One-time setup

### 1. Clone & install
```bash
git clone <your-repo-url> homerentals
cd homerentals
npm install
```

### 2. Environment variables
Copy `.env.example` to `.env.local` and fill in:
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-from-supabase-dashboard>
VITE_MAPBOX_TOKEN=<your-mapbox-public-token>   # optional
```
Find these in Supabase dashboard → Project Settings → API.

### 3. Supabase CLI (for one-command DB migrations)
```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-ref>     # ref is in your dashboard URL
```

Verify it works:
```bash
supabase db push --dry-run
```

### 4. Run the app
```bash
npm run dev
```

---

## Day-to-day workflow

After pulling new commits:

```bash
git pull
supabase db push     # only if there's a new file under supabase/migrations/
npm run dev
```

That's it.

---

## Folder layout

- `supabase/migrations/` — **canonical migrations**, applied by `supabase db push`. Timestamped filenames.
- `db/migrations/` — legacy mirror with sequential names (`0001_…`). Kept for reference only; do not apply manually.
- `src/` — React + TanStack frontend.
- `scripts/seed.mjs` — optional seed data (uses `SUPABASE_SERVICE_ROLE_KEY`, never bundled).

---

## Common issues

| Problem | Fix |
| --- | --- |
| `supabase db push` says "no migrations to apply" but DB looks stale | A previous migration was applied via SQL Editor. Run `supabase migration repair --status applied <version>` for each old timestamp, then `db push`. |
| Mapbox map not rendering | Token missing or invalid — UI falls back to a banner; safe to ignore for the demo. |
| `duplicate key … leases_one_active_per_property` | A property already has an active lease. End it first from Landlord → Listings. |
| Auth "session missing" after redeploy | Clear `localStorage` for `localhost:5173` and sign in again. |

