## Scope
Simplify the Payments page on both tenant and landlord dashboards by removing tabs that don't apply to our system.

## Changes

### 1. `src/pages/tenant/Payments.tsx`
- Remove the "Received" tab and the `incoming` state + its fetch.
- Drop the `Tabs` wrapper entirely — render the "Sent" list directly under the rent card.

### 2. `src/pages/landlord/Payments.tsx`
- Remove the "To technicians" tab and the `outgoing` state + its fetch.
- Drop the `Tabs` wrapper entirely — render the "From tenants" list directly.

### 3. Untouched
- `src/lib/payments.ts` helpers, DB schema, and `PaymentCard` component stay as-is.

## Acceptance
- Tenant Payments page shows only the rent card + a single list of sent payments.
- Landlord Payments page shows only a single list of payments received from tenants.
- Build passes.
