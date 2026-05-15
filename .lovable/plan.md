
# HomeRentals — Final Year Project Build Plan

A clean, export-ready, beginner-maintainable rental platform for Pakistan. No SSR, no server middleware, no Lovable references.

## Stack (locked)
- **Vite + React 18 + TypeScript** SPA (no SSR)
- **React Router v6**
- **Tailwind + shadcn/ui** (already scaffolded — kept)
- **Supabase JS** directly (auth, Postgres, storage, RLS) — no edge functions
- **Mapbox GL JS** (optional enhancement, see resilience rules below)
- **TanStack Query** for data fetching
- **react-hook-form + zod** for validation
- **Recharts** for admin analytics
- **sonner** toasts, **lucide-react** icons

> Current scaffold is TanStack Start with Lovable's Vite config. Phase 0 replaces it with a vanilla Vite SPA so it runs anywhere with `npm install && npm run dev`.

## Phase 0 — Detox the scaffold
- Replace `vite.config.ts` with `@vitejs/plugin-react` + `vite-tsconfig-paths` (no Lovable / Cloudflare plugins).
- Remove TanStack Start: `wrangler.jsonc`, `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routes/`, `src/routeTree.gen.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/integrations/supabase/*`, `.lovable/`.
- Remove deps: `@lovable.dev/vite-tanstack-config`, `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/router-plugin`, `@cloudflare/vite-plugin`, `wrangler`.
- Add deps: `react-router-dom`, `@supabase/supabase-js`, `mapbox-gl` + `@types/mapbox-gl`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`, `recharts`, `date-fns`.
- Add root `index.html`, `src/main.tsx`, `src/App.tsx`. Update `tsconfig.json` paths, `package.json` scripts (`dev`, `build`, `preview`, `lint`, `seed`), `.gitignore`, `.env.example`, `vercel.json`, `netlify.toml` (SPA fallback).
- Strip every Lovable reference, favicon, meta. Brand as **HomeRentals**.

## Folder structure
```text
homerentals/
├── README.md  .env.example  index.html  vite.config.ts  tailwind.config.ts
├── postcss.config.js  vercel.json  netlify.toml  package.json
├── docs/{ARCHITECTURE,ERD,API,USER_FLOWS,DEMO_ACCOUNTS}.md
├── supabase/
│   ├── migrations/0001_roles_profiles.sql … 0006_storage_buckets.sql
│   └── seed.sql
├── scripts/seed.mjs                # node + service-role: demo users + data
└── src/
    ├── main.tsx  App.tsx  index.css
    ├── lib/{supabase,utils,format,validators,constants}.ts
    ├── providers/{AuthProvider,QueryProvider}.tsx
    ├── hooks/{useAuth,useRole,useProperties,useFavorites,useDebounce}.ts
    ├── components/
    │   ├── ui/                     # shadcn (kept)
    │   ├── layout/{PublicLayout,DashboardLayout,Sidebar,Topbar,Footer}.tsx
    │   ├── auth/{ProtectedRoute,RoleRoute}.tsx
    │   ├── property/{PropertyCard,PropertyGrid,PropertyFilters,PropertyGallery,PropertyForm,ImageUploader}.tsx
    │   ├── map/{PropertyMap,MapFallback}.tsx
    │   ├── feedback/{EmptyState,LoadingSkeleton,ErrorState}.tsx
    │   └── shared/{StatCard,StatusBadge,PageHeader,ConfirmDialog}.tsx
    └── pages/
        ├── public/{Landing,Browse,PropertyDetail,Login,Signup,ResetPassword}.tsx
        ├── tenant/{Dashboard,Favorites,Applications,Lease,Maintenance}.tsx
        ├── landlord/{Dashboard,Listings,ListingForm,Applications,Tenants}.tsx
        ├── maintenance/{Dashboard,TicketDetail}.tsx
        ├── admin/{Dashboard,Users,Listings,Complaints}.tsx
        └── shared/{Messages,Notifications,Settings}.tsx
```

## Routes (React Router v6)
```text
/  /browse  /properties/:id  /login  /signup  /reset-password
/app                    DashboardLayout (ProtectedRoute)
  /app/dashboard        role-aware redirect
  /app/tenant/*         RoleRoute role=tenant
  /app/landlord/*       RoleRoute role=landlord
  /app/maintenance/*    RoleRoute role=maintenance
  /app/admin/*          RoleRoute role=admin
  /app/messages  /app/notifications  /app/settings
*                       NotFound
```

## Database
RLS on every table. Roles in a separate table with `has_role()` SECURITY DEFINER (no recursion).

```text
profiles, user_roles (enum: tenant|landlord|maintenance|admin),
properties, property_images, favorites,
applications, leases,
maintenance_tickets (with photos / before_photos / after_photos jsonb),
complaints, messages, notifications
```
- Trigger on `auth.users` insert → row in `profiles` + default `tenant` role.
- Storage buckets: `property-images`, `avatars`, `maintenance-photos` (public for demo simplicity), `documents` (private).
- Indexes on `properties(city,status,monthly_rent)` and `(lat,lng)`.

## Auth & roles
- `AuthProvider` wraps `supabase.auth.getSession()` + `onAuthStateChange`, joins `profiles` + `user_roles`, exposes `{ user, profile, role, loading, signOut }`.
- `ProtectedRoute` → `/login` if anonymous. `RoleRoute` → friendly "no access" page on mismatch.

## Validations (zod)
- CNIC `^\d{5}-\d{7}-\d$`, phone `^\+92\d{10}$`, PKR positive int ≤10 digits, image ≤5MB png/jpeg/webp ≤10/listing, lease `start < end`.

## Mapbox resilience (hard requirement)
The map is **always** an enhancement, never a dependency. `<PropertyMap>` is rendered inside an error/availability boundary and follows this contract:

1. **Token detection** — `VITE_MAPBOX_TOKEN` is read once. If missing/empty, the map component never mounts; `<MapFallback>` renders instead.
2. **Lazy load** — `mapbox-gl` is dynamically imported; failure to load (offline, blocked CDN, CSP) is caught and downgrades to fallback.
3. **Runtime error capture** — listens for `map.on('error', …)` and any thrown init error; once triggered, the map unmounts and the fallback shows.
4. **Fallback UI** — a soft banner reading **"Map unavailable right now"** + a small static city-tag strip. The property cards/grid/list **always** render alongside, regardless of map state.
5. **No layout shift** — fallback occupies the same map slot height so the page never reflows or crashes.
6. **Detail page** — same rule: gallery + details render fully even if the small location map fails.

`<Browse>` layout: filters bar on top, two-pane below — left = `<PropertyGrid>` (always works), right = `<PropertyMap>` or `<MapFallback>`. On mobile the map collapses behind a "Show map" toggle (also degrades gracefully).

## UI direction (modern SaaS — Zameen / Airbnb feel)
Clean white surface, slate text, single emerald accent, rounded-xl cards, subtle shadows. Plus Jakarta Sans (display) + Inter (body). Sticky public header, hero with city search, property cards (image carousel, Verified/New badges, PKR price). Skeletons + empty states everywhere. Mobile-first 1/2/3-col grids.

## Local setup (README)
1. `git clone … && npm install`
2. Create Supabase project → copy URL + anon + service-role keys.
3. Get Mapbox public token (optional — app works without it).
4. `cp .env.example .env`, fill values.
5. Apply schema: paste each `supabase/migrations/*.sql` then `seed.sql` into the SQL editor (or `npx supabase db push`).
6. `npm run seed` → demo users + listings.
7. `npm run dev` → http://localhost:5173

`.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MAPBOX_TOKEN=          # optional — UI gracefully degrades when blank
SUPABASE_SERVICE_ROLE_KEY=  # only used by scripts/seed.mjs
```

## Deployment
- **Vercel:** zero-config + `vercel.json` SPA rewrite. Set `VITE_*` env vars.
- **Netlify:** `netlify.toml` redirect `/* → /index.html 200`.
- **Local hosting:** `npm run build && npm run preview`.

## Demo accounts (seeded)
| Role | Email | Password |
|---|---|---|
| Admin | admin@homerentals.pk | Demo@1234 |
| Landlord | landlord@homerentals.pk | Demo@1234 |
| Tenant | tenant@homerentals.pk | Demo@1234 |
| Maintenance | maintenance@homerentals.pk | Demo@1234 |

Seed: ~12 properties across Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad with realistic PKR rents; sample applications, one active lease, two maintenance tickets.

## Build order
1. Phase 0 detox.
2. Migrations + seed.
3. Auth shell (client, AuthProvider, login/signup/reset, protected/role routes).
4. Public surface (Landing, Browse with **Mapbox + fallback**, PropertyDetail).
5. Landlord (CRUD, image uploader, applications inbox, approve/reject).
6. Tenant (favorites, apply, applications, lease, maintenance form).
7. Maintenance (ticket queue, status workflow, before/after photos).
8. Admin (users, listing verification, complaints, Recharts analytics).
9. Messaging + notifications (TanStack Query polling every 15s — no realtime channels).
10. Docs (README, ARCHITECTURE, ERD mermaid, API, USER_FLOWS, DEMO_ACCOUNTS).
11. QA pass (empty states, skeletons, mobile, 404, error boundaries, **Mapbox fallback verified by unsetting the token**).

## Out of scope
Real payment gateway, SSR/edge functions, realtime subscriptions, i18n/Urdu, push/email notifications.

Reply **approve** to start with Phase 0 and ship the full build.
