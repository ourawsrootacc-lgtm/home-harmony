## Plan: show current tenants correctly in the landlord Tenants tab

### Goal
If a lease is shown as **Active / Current** on the lease page, the related tenant must also appear in the landlord’s **Tenants** tab.

### What I’ll change
- Update `src/pages/landlord/Tenants.tsx` so it uses the same current lease statuses as the landlord Leases page:
  - `active`
  - `pending_activation`
  - `holdover`
  - `disputed`
- Keep the Tenants page focused on actual current tenants, not old/rejected/terminated leases.
- Improve the data fetch so tenant details are loaded reliably, matching the working pattern already used in `src/pages/landlord/Leases.tsx`.
- Add a loading state so the page does not briefly show “No active tenants” before the data finishes loading.

### Expected result
- The landlord will see Hassan Ali in the Tenants tab for the Bahria Town lease.
- The Tenants tab and the Leases “Active” tab will stay consistent.
- “No active tenants” will only show when there truly are no current/active leases.