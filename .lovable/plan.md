## Intended flow (your clarification)

1. Tenant applies to a property.
2. Tenant and landlord **chat freely in Messages** to negotiate terms (rent, deposit, dates, rules).
3. Once they verbally agree, the **landlord drafts the formal lease agreement** from the Applications page (the existing "Send lease offer" dialog).
4. **Tenant reviews and accepts** that lease on their "My Lease" page (no counter loop required for the happy path — they accept or decline).
5. Once tenant accepts, the lease becomes **active** and the property is marked rented.

The DB and helpers already support this; the gaps are (A) landlord can't see/manage what happens after sending the offer, and (B) Messages is unreliable so step 2 never completes.

---

## What I found

### Gap 1 — Landlord has no lease management page
- `src/pages/tenant/Lease.tsx` lets the tenant see offers, accept, decline (and counter, which we'll de-emphasise per your flow).
- The landlord sidebar has Overview, Listings, Applications, Tenants — **no Leases page**. After clicking "Send lease offer" they're flying blind: they can't see whether the tenant accepted, withdraw the offer, or terminate an active lease.

### Gap 2 — Messages are unreliable
- `src/pages/shared/Messages.tsx` is a flat feed of every message you've ever exchanged — no threads, no unread badges.
- New messages only appear via a 15-second poll. No realtime.
- If you open `/app/messages` directly (not via "Discuss terms"), it asks you to **paste a user id** into a text box. Easy to send to the wrong uuid or empty string → message goes nowhere visible.
- This is why the tenant screen shows "No messages yet" even after the landlord sent something.

Database + RLS for both `messages` (migration 0005) and the lease lifecycle (migration 0007) are already correct. No schema work needed.

---

## Plan

### Part A — Fix Messages first (this is what blocks step 2 of your flow)

Rewrite `src/pages/shared/Messages.tsx` around **conversations**:

1. **Threaded layout**: left column = list of counterparties (name, last message snippet, unread badge, timestamp). Right column = selected thread, oldest→newest, sticky composer at the bottom.
2. **No more pasted user ids**: composer is only enabled inside a thread. New threads start exclusively from `?to=<uuid>` (already wired into "Discuss terms" on Applications, "Message landlord" on the tenant lease page, and "Message tenant" we'll add on the landlord lease page). The free-text recipient input is removed.
3. **Realtime delivery**: subscribe to a Supabase realtime channel on `messages` filtered to rows where the current user is sender or recipient. New messages append instantly. Keep a 30s safety poll.
4. **Mark-as-read**: when a thread is opened, set `read_at = now()` on incoming messages (RLS already allows recipient updates).
5. **Visible link to draft the agreement**: when the landlord is viewing a thread with a tenant who has applied to one of their properties, surface a small "Draft lease agreement" button that deep-links to `Applications` filtered to that tenant. This bridges step 2 → step 3 of your flow.

### Part B — Landlord "Leases" page (so step 3 → 5 is visible)

Create `src/pages/landlord/Leases.tsx` with three tabs:

- **Sent offers** (statuses `proposed`, `countered`): for each offer show the property, the tenant, the terms snapshot, and:
  - "Waiting for tenant to accept" badge,
  - `Message tenant` (deep-links to the thread),
  - `Withdraw offer` (calls `declineOffer(..., "landlord_withdrew")`),
  - `Edit & resend` (opens the same OfferDialog with current terms pre-filled, which creates a new version via `counterOffer`).
- **Active** (`active`, `pending_activation`, `holdover`, `disputed`): property + tenant + key terms + `Message tenant` + `Terminate lease` (with reason).
- **Past** (`ended`, `terminated`, `rejected`): read-only history.

Wire-up:
- Add `landlord/leases` route in `src/App.tsx` under `RoleRoute role="landlord"`.
- Add `{ to: "/app/landlord/leases", label: "Leases", icon: FileText }` to the landlord nav in `src/components/layout/DashboardLayout.tsx`.
- In `src/pages/landlord/Applications.tsx`, replace the static "Manage from My leases" hint with a real link to `/app/landlord/leases`.

### Part C — Tenant Lease page tweaks (align with your "accept, don't counter" flow)

In `src/pages/tenant/Lease.tsx`:
- Reorder buttons to make **"Accept & sign"** the primary action and demote **"Counter"** to a secondary/ghost button (so the negotiation pressure stays in Messages, as you described).
- Add a top-of-card hint: *"Already discussed terms with your landlord? Review and accept below."*
- When the tenant accepts and both signatures are present, the existing `signCurrentVersion` flow already flips the lease to `active` — no change needed there.

### Technical details
- **No DB migrations.** All tables, policies, and helpers (`sendInitialOffer`, `signCurrentVersion`, `counterOffer`, `declineOffer`, `terminateLease` in `src/lib/lease.ts`) already exist.
- **Files created**: `src/pages/landlord/Leases.tsx`.
- **Files edited**: `src/pages/shared/Messages.tsx` (rewrite), `src/App.tsx` (one new route), `src/components/layout/DashboardLayout.tsx` (one nav item), `src/pages/landlord/Applications.tsx` (link to Leases), `src/pages/tenant/Lease.tsx` (button reordering + copy).
- **Realtime**: uses Supabase's existing `realtime` channel (no setup); fallback poll on a 30s interval.
- **No new dependencies, no env changes.**

### Out of scope (ask if you want any of these)
- Email / push notification when a new message or offer arrives.
- File attachments in messages (e.g. share an ID photo or signed PDF).
- OTP-verified signing (currently the signature is stamped automatically when both parties click "Sign").
- Automatic "mark property as rented" — happens implicitly via `leases.status = 'active'`, but we don't currently change `properties.status`.
