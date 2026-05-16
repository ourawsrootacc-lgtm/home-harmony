
# Maintenance Lifecycle Plan

## Research summary (industry patterns)

Looked at how the established players handle this:

- **Property Meld / Latchel / AppFolio / Buildium** (property management): ticket → triage by landlord → dispatch to a vendor → vendor accepts/declines → schedule with tenant → on-site → invoice/quote approval → close with photos. Strict audit trail.
- **TaskRabbit / Thumbtack / Airtasker** (marketplaces): tenant posts task → multiple taskers send **quotes** (price + ETA) → tenant picks one → in-app chat to negotiate → confirm → work → release payment → mutual review.
- **Uber/Bolt-style dispatch** (urgency): system auto-offers to nearest available tech, 60-sec accept window, falls through to next.

**Common non-negotiables** across all of them:
1. Every state change is logged with actor + timestamp (legal trail).
2. Price and schedule are **proposals** that need the other party's explicit acceptance — never silently changed.
3. Before/after photos are mandatory to close.
4. Cancellation has rules (who can cancel, when, fee).
5. Disputes escalate to admin with full timeline visible.
6. Tenant rates the tech; tech rates the tenant — reputation drives future dispatch.

## What we have today

`maintenance_tickets`: tenant creates → landlord/maintenance see → tech sets status `open → in_progress → resolved → closed`. No quotes, no scheduling, no negotiation, no acceptance, no proof-of-work gating, no ratings. This is the gap to close.

## Proposed lifecycle (state machine)

```text
                       ┌──────────────────────────────────────────┐
                       │                                          │
draft → submitted → triaged → dispatched ─→ quoted ─→ scheduled ─→ in_progress ─→ work_done ─→ tenant_verified ─→ closed
                          │            │           │            │                                 │
                          │            ↓           ↓            ↓                                 ↓
                          │       declined    counter_quote  reschedule_requested              disputed → admin_review
                          ↓
                       cancelled (by tenant/landlord, with reason)
```

State definitions:

| State | Who moves it | Meaning |
|---|---|---|
| `submitted` | tenant | ticket created with category, priority, photos, description |
| `triaged` | landlord (or auto) | landlord reviews, sets urgency SLA, approves dispatch |
| `dispatched` | landlord / system | offered to one or more technicians |
| `quoted` | technician | tech submits price + ETA + scheduled window + scope |
| `counter_quote` | tenant or landlord | proposes different price/time, tech must re-accept |
| `scheduled` | mutual | both sides accepted the latest quote |
| `reschedule_requested` | either side | needs counter-acceptance |
| `in_progress` | technician | checked in on site (timestamp + optional geo) |
| `work_done` | technician | uploaded after-photos + invoice |
| `tenant_verified` | tenant | confirmed work satisfactory (or auto after 72h) |
| `disputed` | tenant or tech | freezes flow, admin sees full timeline |
| `closed` | system | terminal |
| `cancelled` | tenant/landlord/tech | terminal, with reason + who-pays-fee rule |

## Data model changes

New tables (one migration `20260517...maintenance_lifecycle.sql`):

1. **`technicians`** — profile extension: skills (jsonb array), service cities, hourly rate, availability schedule, rating avg, jobs completed, is_active, KYC verified.
2. **`maintenance_quotes`** — `ticket_id`, `technician_id`, `price`, `scope`, `proposed_start_at`, `proposed_end_at`, `notes`, `status` (`pending|accepted|countered|declined|withdrawn`), `parent_quote_id` (for counter chain), `created_by`, timestamps. This is the negotiation log.
3. **`maintenance_events`** — full audit log: `ticket_id`, `actor_id`, `actor_role`, `from_state`, `to_state`, `payload jsonb`, `created_at`. Append-only, no deletes (RLS forbids delete). This is the court-defendable trail.
4. **`maintenance_assignments`** — when a ticket is dispatched to one or more techs: `ticket_id`, `technician_id`, `offered_at`, `expires_at`, `response` (`pending|accepted|declined`). Supports broadcast dispatch.
5. **`maintenance_reviews`** — mutual: `ticket_id`, `rater_id`, `ratee_id`, `direction` (`tenant_to_tech|tech_to_tenant`), `stars`, `comment`. One per direction per ticket.
6. **`maintenance_cancellations`** — `ticket_id`, `cancelled_by`, `reason_code`, `notes`, `fee_applied`.

Alter `maintenance_tickets`:
- replace freeform `status` with the new enum
- add `accepted_quote_id`, `sla_due_at`, `tenant_verified_at`, `closed_at`, `cancelled_at`

Trigger: every UPDATE on `maintenance_tickets.status` writes a row into `maintenance_events`. Every quote insert/update writes one too. **You can never lose history.**

## RLS rules (fairness + court-defendability)

- Tenant: read own ticket; insert quote response (accept/counter/decline); insert review after `closed`; insert dispute.
- Landlord: read tickets on own property; triage, dispatch, cancel-with-cause, approve quotes when tenant absent.
- Technician: read tickets assigned to them; insert/update only their own quotes; transition `scheduled → in_progress → work_done`; insert review.
- Admin: read all; resolve disputes; override states with mandatory reason logged.
- `maintenance_events`: SELECT for any party on the ticket; INSERT only via trigger (no manual write); DELETE forbidden to everyone including admin.

## Fairness rules (defendable)

1. **Price cannot change after `scheduled`** without a new quote round both sides accept. Tech cannot invoice more than accepted quote unless they raise a `change_order` (which is just a new quote requiring tenant acceptance).
2. **24-hour rule**: tenant or tech can cancel free up to 24h before scheduled time. Inside 24h: cancellation fee (configurable, default 10% of quote) goes to the other party.
3. **Auto-verify**: if tenant doesn't verify within 72h of `work_done`, ticket auto-moves to `tenant_verified` (prevents tech being held hostage), but tenant retains 7-day dispute window.
4. **Two-strike dispute**: if tenant disputes, work is frozen, admin reviews `maintenance_events` + photos + chat. Decision is logged with reason. Either side gets one appeal.
5. **Rating gates**: technicians below 3.0 average over last 10 jobs auto-removed from dispatch pool until admin re-approves.
6. **SLA tiers** by priority: `high` = 24h triage + dispatch, `medium` = 72h, `low` = 7 days. Breach logged, visible to admin.

## UI surfaces

- **Tenant — Maintenance** (existing): keep create form. New ticket detail page with timeline, incoming quotes list, accept/counter buttons, scheduled window, after-photos viewer, verify/dispute buttons, review form.
- **Landlord — Maintenance Inbox** (new section in `landlord/`): triage queue, dispatch picker (filter techs by skill/city/rating), oversight view, dispute escalation.
- **Maintenance — Dashboard** (existing): replace simple status buttons with: incoming offers (accept/decline window with countdown), my active jobs (quote / schedule / check-in / upload work / submit invoice), history, my ratings.
- **Shared timeline component** (`MaintenanceTimeline.tsx`): renders `maintenance_events` as a vertical activity feed — used on all three roles' detail pages. Single source of truth visually.
- **Admin — Disputes** (new tab in admin): list of `disputed` tickets, full timeline, resolution form.

## Implementation phases (so it's reviewable, not one giant PR)

**Phase 1 — schema + audit trail** (this turn's plan is to stop here for approval): migration with the 6 new tables, status enum, triggers, RLS. Updates `src/lib/maintenance.ts` (new) with typed helpers + state-transition guards mirrored in TypeScript. No UI changes yet — existing screens keep working against the new schema because we keep `status` text-compatible.

**Phase 2 — quoting + scheduling UI**: tenant detail page, tech offer/quote UI, counter-quote flow, accept → scheduled.

**Phase 3 — execution + verification**: check-in, before/after photos enforcement, invoice, tenant verify / dispute, auto-verify cron.

**Phase 4 — reviews, ratings, dispatch intelligence**: mutual reviews, rating aggregation, dispatch pool filtering, SLA breach reporting, admin dispute console.

## Out of scope (call out explicitly)

- Real payment escrow (Stripe Connect etc.) — quote price is **recorded**, not collected. Add later if you want managed payments.
- SMS/WhatsApp notifications — in-app `notifications` table only for now.
- Geo-verified check-in — schema has the column, enforcement is Phase 3+.
- Vendor companies (multi-tech orgs) — single-tech model now, extendable later via a `vendor_id` on `technicians`.

## What I need from you before building

1. Confirm the **state machine** above (especially: auto-verify after 72h, 24h cancel rule, change-order pattern).
2. Confirm **dispatch model**: should landlord pick one tech, or broadcast to N techs and first-accept wins? (Different UX.)
3. Confirm **who pays the technician** in your model — tenant directly, landlord, or platform-managed? This decides whether `accepted_quote.price` is a charge to tenant or a bill to landlord.
4. OK to proceed with **Phase 1 only** after your answers, then stop for review before Phase 2?
