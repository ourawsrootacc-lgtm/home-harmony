# API (Supabase tables and key queries)

The app talks to Supabase directly. Each table has RLS enabled; the policies do the access control.

## Reads

- `properties` — public read (active listings on `/browse`)
- `property_images` — public read
- `profiles` — public read (for landlord name on listings)
- `applications` — tenant sees own; landlord sees apps for own properties
- `leases` — tenant + landlord parties; admin sees all
- `maintenance_tickets` — tenant own; landlord on own props; maintenance/admin all
- `favorites`, `notifications` — owner only
- `messages` — sender + recipient

## Writes

- `properties.insert` — only when `auth.uid() = landlord_id` and user has `landlord` role
- `applications.insert` — only when `auth.uid() = tenant_id` and user has `tenant` role
- `applications.update` — tenant can cancel own; landlord can decide on their property's apps
- `leases.insert/update` — only the landlord on a property
- `maintenance_tickets.insert` — only the tenant; updates by maintenance / admin or property landlord
- `complaints.insert` — any user; resolved by admin
- `notifications.insert` — admin or self
- `messages.insert` — only the sender

## Storage

| Bucket | Public | Path convention |
|---|---|---|
| `property-images` | yes | `{user_id}/{property_id}/{file}` |
| `avatars` | yes | `{user_id}/{file}` |
| `maintenance-photos` | yes | `{user_id}/{ticket_id}/{file}` |
| `documents` | private | `{user_id}/{file}` |

Uploads are restricted by storage policies that pin the first folder to `auth.uid()`.
