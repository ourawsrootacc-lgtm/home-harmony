## Root cause

The database is not generally broken. `npx supabase db push` is failing because the cleanup migration deletes rows from `auth.users` while several tables still contain foreign keys to those same demo user IDs **without `ON DELETE CASCADE`**.

We fixed the first blocker (`lease_signatures.user_id`), so PostgreSQL moved to the next blocker shown in your screenshot: `payment_events.actor_id`. If we only fix that one, more may appear. The right fix is to clear every non-cascading user reference before deleting the demo users.

## What I found in the deep search

These demo-user references can block deletion because they do not cascade automatically:

- `payment_events.actor_id` — current screenshot error
- `payments.reviewed_by`
- `lease_signatures.user_id`
- `lease_versions.proposed_by`
- `lease_events.actor_id`
- `deposit_ledger.recorded_by`
- `deposit_ledger.acknowledged_by`
- `lease_requests.requested_by`
- `lease_requests.responded_by`
- `maintenance_tickets.assigned_to`
- `maintenance_events.actor_id`
- `maintenance_quotes.created_by`
- `maintenance_cancellations.cancelled_by`

Many other tables are safe because they already use `ON DELETE CASCADE`, for example `profiles`, `user_roles`, `properties`, `applications`, `leases`, `payments.payer_id`, `payments.payee_id`, `payment_methods`, documents, messages, favorites, and reviews.

## Implementation plan

1. Update `supabase/pending_migrations/20260524110000_remove_demo_accounts.sql` so it defines the four demo users once in a temporary CTE/table.
2. Before `delete from auth.users`, clean all non-cascading references in a safe dependency order:
   - delete pure audit/event rows that point to demo users where appropriate (`payment_events`, `lease_events`, `maintenance_events`)
   - delete/clear lifecycle records that directly depend on those users (`lease_signatures`, `lease_requests`, `deposit_ledger`, `maintenance_cancellations`)
   - null optional references where preserving parent rows is safer (`payments.reviewed_by`, `maintenance_tickets.assigned_to`)
   - delete demo-authored records that cannot exist without their user (`lease_versions.proposed_by`, `maintenance_quotes.created_by`) after child rows are handled
3. Then delete the demo accounts from `auth.users`, allowing all cascading tables to clean themselves normally.
4. Update `.lovable/plan.md` with the corrected diagnosis so the local setup instructions no longer suggest fixing one table at a time.

## Local command after the change

Because your failed migration may now be recorded as failed locally/remotely, run:

```bash
npx supabase migration repair --status reverted 20260524110000
npx supabase db push
```

If the first command says there is nothing to repair, just run `npx supabase db push` again.