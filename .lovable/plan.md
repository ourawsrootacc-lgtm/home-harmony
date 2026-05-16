# Remove "Maintenance staff" from signup role options

## Changes

**`src/pages/public/Signup.tsx`**
- Drop the `<SelectItem value="maintenance">Maintenance staff</SelectItem>` option from the role dropdown — only Tenant and Landlord remain.
- Update the subtitle line: "Join HomeRentals as a tenant or landlord."

**`src/lib/validators.ts`**
- Narrow the signup role enum to `z.enum(["tenant", "landlord"])` so backend validation matches the UI.

## Out of scope
- `ROLE_LABELS["maintenance"]` and the `maintenanceSchema` (for repair tickets) stay — those are used by maintenance ticket flows, not signup. Existing maintenance accounts (if any) are not deleted; they just can't be created via public signup anymore.
- Admin-side creation of maintenance staff is not added here.

## Acceptance
1. The "Create account" form's role dropdown shows only Tenant and Landlord.
2. Submitting any other role value is rejected by the Zod schema.