# Remove Admin + Maintenance Role + Maintenance & Notifications Tabs

## Scope
Remove the entire Admin section, the entire Maintenance technician role section, the "Maintenance" tab from both Tenant and Landlord dashboards, and the "Notifications" tab/page for everyone.

## Changes

### 1. `src/App.tsx`
- Remove imports: `MaintenanceDashboard`, `MaintenanceProfile`, `AdminDashboard`, `AdminUsers`, `AdminListings`, `AdminComplaints`, `TenantMaintenance`, `LandlordMaintenance`, `Notifications`.
- Remove routes:
  - `tenant/maintenance`
  - `landlord/maintenance`
  - all `maintenance/*` routes
  - all `admin/*` routes
  - `notifications`
- In `RoleRedirect`, drop the `admin` branch.

### 2. `src/components/layout/DashboardLayout.tsx`
- Remove `Maintenance` nav item from `tenant` and `landlord` arrays.
- Remove `maintenance` and `admin` keys from the `NAV` map.
- Remove `Notifications` entry from `SHARED`.
- Drop unused icon imports (`Wrench`, `ShieldCheck`, `UserCog`, `Bell`).

### 3. Delete page files
- `src/pages/admin/` (entire folder)
- `src/pages/maintenance/` (entire folder)
- `src/pages/tenant/Maintenance.tsx`
- `src/pages/landlord/Maintenance.tsx`
- `src/pages/shared/Notifications.tsx`

### 4. Leave untouched
- `src/components/maintenance/*` and `src/lib/maintenance*.ts` — shared libraries left on disk (dead code, no build impact). Say the word if you want them deleted too.
- Database tables, migrations, role enums, notification triggers — untouched.

## Acceptance
- Tenant sidebar: Overview, Favorites, Applications, My Lease, Payments + Messages, Settings.
- Landlord sidebar: Overview, Listings, Applications, Leases, Tenants, Payments + Messages, Settings.
- No Notifications link anywhere.
- `/app/admin*`, `/app/maintenance*`, `/app/*/maintenance`, `/app/notifications` → 404.
- Build passes.
