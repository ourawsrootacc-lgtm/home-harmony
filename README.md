# HomeRentals

A full-stack rental property management platform for the Pakistani housing market — built as a clean, beginner-maintainable final-year project.

**Stack:** React 18 + Vite + TypeScript · React Router v6 · Tailwind CSS + shadcn/ui · Supabase (Postgres + Auth + Storage + RLS) · Mapbox GL JS · TanStack Query · React Hook Form + Zod · Recharts.

## Features

- **Auth + roles** (tenant · landlord · maintenance · admin) backed by Supabase, with a dedicated `user_roles` table and a SECURITY DEFINER `has_role()` function (no recursive RLS).
- **Public browsing** — filters (city / type / price / search), grid + interactive Mapbox map, property detail page with image gallery.
- **Landlord** — listings CRUD, photo upload, applications inbox (approve creates an active lease automatically).
- **Tenant** — favorites, applications, lease info, maintenance ticket form.
- **Maintenance** — ticket queue with status workflow (open → in progress → resolved → closed).
- **Admin** — users management with ban/unban, listing verification, complaints moderation, analytics dashboard with Recharts.
- **Messaging + notifications** — simple table-backed messaging with 15s polling.
- **Mapbox graceful degradation** — a missing token, blocked CDN, or runtime error never breaks the page; a friendly "Map unavailable right now" banner appears and listings continue to render.

## Quick start

```bash
git clone <your-fork>
cd homerentals
npm install
cp .env.example .env       # fill in the values below
npm run dev                # http://localhost:8080
```

### Required environment variables

| Variable | Where to get it | Required? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project Settings → API | yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase project Settings → API (anon public key) | yes |
| `VITE_MAPBOX_TOKEN` | mapbox.com → Tokens (any default public token works) | optional |
| `SUPABASE_URL` | same value as `VITE_SUPABASE_URL` | only for `npm run seed` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API (service role) | only for `npm run seed` |

### Database setup

Either:

- **Easy** — open the Supabase SQL editor and run the files in `db/migrations/` in order (0001 → 0006), or
- **CLI** — copy the files into `supabase/migrations/`, then `npx supabase link --project-ref <ref> && npx supabase db push`.

Then seed demo users + sample listings:

```bash
npm run seed
```

### Demo accounts (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | admin@homerentals.pk | Demo@1234 |
| Landlord | landlord@homerentals.pk | Demo@1234 |
| Tenant | tenant@homerentals.pk | Demo@1234 |
| Maintenance | maintenance@homerentals.pk | Demo@1234 |

## Deployment

- **Vercel** — import the repo, add the three `VITE_*` env vars, deploy. `vercel.json` adds the SPA rewrite.
- **Netlify** — same flow; `netlify.toml` provides the redirect.
- **Local hosting** — `npm run build && npm run preview` (or serve `dist/` with any static host).

## Project structure

```
src/
  main.tsx, App.tsx, styles.css
  lib/            supabase client, formatters, validators, constants
  providers/      AuthProvider (session + profile + role)
  components/
    auth/         ProtectedRoute, RoleRoute
    layout/       PublicLayout, DashboardLayout
    property/     PropertyCard
    map/          PropertyMap (with built-in fallback)
    feedback/     EmptyState, LoadingGrid, PageHeader, ConfigBanner
    ui/           shadcn primitives
  pages/
    public/       Landing, Browse, PropertyDetail, Login, Signup, ResetPassword, NotFound
    tenant/       Dashboard, Favorites, Applications, Lease, Maintenance
    landlord/     Dashboard, Listings, ListingForm, Applications, Tenants
    maintenance/  Dashboard
    admin/        Dashboard, Users, Listings, Complaints
    shared/       Messages, Notifications, Settings
supabase/migrations/  schema as 6 SQL files
scripts/seed.mjs       Node seed script (uses service role key)
docs/                  ARCHITECTURE, ERD, API, USER_FLOWS
```

## Validations

- Pakistani phone format `+92XXXXXXXXXX`
- CNIC format `12345-1234567-1`
- PKR amounts: positive integers up to 10 digits
- Image upload: ≤ 5 MB, PNG/JPEG/WEBP only
- Property coordinates clamped to valid lat/lng ranges
- Lease `end_date > start_date` (DB-level CHECK)

## License

MIT — for educational use.
