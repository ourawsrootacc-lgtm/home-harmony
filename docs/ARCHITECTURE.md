# Architecture

HomeRentals is a single-page React application that talks directly to Supabase. There is **no custom backend server** — Supabase provides Postgres, Auth, Storage and Row-Level Security, and the React app is the only frontend.

```
┌──────────────────────┐         ┌────────────────────────────┐
│  React + Vite SPA    │  HTTPS  │  Supabase (managed)        │
│                      ├────────▶│  • Postgres + RLS          │
│  React Router v6     │         │  • Auth (JWT in storage)   │
│  TanStack Query      │         │  • Storage buckets         │
│  Tailwind/shadcn     │         └────────────────────────────┘
│                      │         ┌────────────────────────────┐
│  Mapbox GL JS        ├────────▶│  Mapbox tiles (optional)   │
└──────────────────────┘         └────────────────────────────┘
```

## Data flow

1. `AuthProvider` calls `supabase.auth.getSession()` and subscribes to `onAuthStateChange`.
2. After login, it loads the user's `profile` and `user_roles` record into context.
3. `ProtectedRoute` blocks unauthenticated access; `RoleRoute` enforces role.
4. Pages query Supabase directly through `@supabase/supabase-js`. RLS guarantees row-level security regardless of what the client requests.
5. Mutations (insert/update/delete) likewise go straight to Supabase; UI re-fetches.

## Roles + RLS

Roles live in a separate `user_roles` table — never on `profiles`. A `SECURITY DEFINER` function `has_role(uid, role)` is used inside RLS policies to avoid recursion.

## Mapbox resilience

`PropertyMap` lazy-imports `mapbox-gl`, listens for runtime errors, and downgrades to `MapFallback` (a soft "Map unavailable" banner) on missing token, network failure, or any GL error. The property grid/list always renders — the map is purely additive.

## Why no SSR / no edge functions

The brief prioritises beginner maintainability, simple deployment to any static host (Vercel/Netlify/local) and zero vendor lock-in. All business logic stays in two places: SQL (RLS) and React components.
