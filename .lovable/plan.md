## Fix: Landlord "Tenants" page shows empty even when an active lease exists

### Root cause
`src/pages/landlord/Tenants.tsx` filters leases with `.eq("status", "active")` only. But on the Leases page, the "Active" tab treats four statuses as active:

```
ACTIVE_STATUSES = ["active", "pending_activation", "holdover", "disputed"]
```

The lease in the screenshot is in the "Active" tab but its "Activated" field is `—`, so its real DB status is almost certainly `pending_activation` (signed by both parties, not yet auto-activated). The Tenants query filters it out, so the page renders "No active tenants".

### Change
- `src/pages/landlord/Tenants.tsx`: replace `.eq("status", "active")` with `.in("status", ["active", "pending_activation", "holdover", "disputed"])` so the Tenants list matches the Leases "Active" tab.

No schema, RLS, or backend changes — purely a frontend query fix.

### Acceptance
- Landlord with the Bahria Town lease sees Hassan Ali listed under Tenants.
- Tenants list stays in sync with the "Active" tab on the Leases page.