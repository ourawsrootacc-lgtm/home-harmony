# Maintenance Lifecycle — Phase 2 (Frontend + Manual Payments + Notifications)

## Why nothing changed yet
Phase 1 only added the database + `src/lib/maintenance.ts` helpers. The UI still uses the old 4-status flow, the landlord has **no Maintenance tab**, and there is no UI for quotes, dispatch, scheduling, reviews, technician onboarding, or payments. Phase 2 wires the new state machine into every role and adds manual (bank / EasyPaisa / JazzCash) payment proofs with a fair approval workflow.

---

## Part A — Maintenance UI

### 1. Shared building blocks (`src/components/maintenance/`)
- `TicketCard.tsx` — unified status badge using `STATUS_LABEL` from `src/lib/maintenance.ts`.
- `TicketTimeline.tsx` — renders `maintenance_events` audit log.
- `QuoteCard.tsx` — price, scope, proposed window, Accept / Counter / Decline.
- `QuoteFormDialog.tsx` — submit or counter a quote.
- `CancelDialog.tsx` — uses `computeCancellationFee()` to preview fee.
- `ReviewDialog.tsx` — 5-star + comment after `tenant_verified`.
- `TechnicianPicker.tsx` — multi-select from `findDispatchableTechnicians()` (city + skill filter).
- `TicketDetailDrawer.tsx` — shared by all roles.

### 2. Tenant — `src/pages/tenant/Maintenance.tsx` (rewrite)
- Submit ticket: category, priority, photos, `funded_by` toggle, location-in-unit.
- List with new badges + auto-verify countdown when `work_done`.
- Detail drawer: timeline, active quote actions, schedule confirmation, "Mark verified", Open dispute, Cancel (with fee preview), Review after close.

### 3. Landlord — NEW `src/pages/landlord/Maintenance.tsx` + nav entry
- Add **"Maintenance"** to landlord nav in `DashboardLayout.tsx`.
- List all tickets for landlord's properties; filter by status / property / priority.
- Triage: set priority + `funded_by`, then **Dispatch** via `TechnicianPicker` (24h broadcast).
- Review incoming quotes; accept on landlord-funded tickets.
- Cancel / dispute / close.

### 4. Technician — `src/pages/maintenance/Dashboard.tsx` (rewrite) + new pages
- Tabs: **Offers** | **Active jobs** | **History**.
- Offers: Accept / Decline (server trigger handles first-accept-wins race).
- Active job: submit/counter quote, Check in (`checkInTechnician`), upload after-photos + Mark work done (`markWorkDone`).
- NEW `src/pages/maintenance/Profile.tsx` — onboarding: skills, service cities, hourly rate, bio, payout method (bank/EasyPaisa/JazzCash account number, account title). Required before receiving offers.

### 5. Admin — `src/pages/admin/Maintenance.tsx` (new)
- Global ticket view, disputed queue, technician roster + ratings, force-close, payment-dispute arbitration.

---

## Part B — Manual Payments (no Stripe)

### Two payment flows
1. **Tenant → Landlord** — rent / tenant-funded maintenance / deposits / late fees.
2. **Payer → Technician** — payer is landlord OR tenant depending on ticket's `funded_by`.

Both flows use the same mechanism: **payer uploads a proof-of-payment image/PDF, payee approves or rejects.**

### Schema (new migration `20260518100000_manual_payments.sql`)
```
payment_methods         -- per-user payout details (bank/easypaisa/jazzcash)
  id, user_id, kind ('bank'|'easypaisa'|'jazzcash'|'cash'),
  account_title, account_number, bank_name, is_default, created_at

payments                -- one row per payment attempt
  id, context ('rent'|'deposit'|'maintenance'|'late_fee'|'cancellation_fee'),
  lease_id NULL, ticket_id NULL, quote_id NULL,
  payer_id, payee_id, amount, currency 'PKR',
  method ('bank'|'easypaisa'|'jazzcash'|'cash'),
  proof_url (storage), reference_no, paid_at, notes,
  status ('submitted'|'approved'|'rejected'|'disputed'|'refund_requested'),
  reviewed_by, reviewed_at, rejection_reason, dispute_reason,
  created_at, updated_at

payment_events          -- append-only audit log (same pattern as maintenance_events)
  id, payment_id, actor_id, actor_role, event_type, payload jsonb, created_at
```

Storage bucket: **`payment-proofs`** (private). RLS: only payer, payee, admin can read a row's proof.

### Fairness & fraud rules (server-enforced)
1. **Reference number required** for non-cash methods (e.g. EasyPaisa TID, bank transaction ID) — uniqueness checked per `(method, reference_no)` to prevent re-submission of the same receipt.
2. **One open submission per (lease/ticket, context)** at a time — payer can't spam.
3. **48-hour auto-approve window**: if payee neither approves nor rejects within 48h, payment auto-flips to `approved` and a `payment_auto_approved` event is recorded. Payee can still dispute within 7 days (`refund_requested`).
4. **Rejection requires a reason** (≥10 chars) — prevents silent rejection.
5. **Dispute path**: either side can mark `disputed` → goes to admin queue.
6. **Tamper protection**: `proof_url`, `amount`, `reference_no` become immutable once status leaves `submitted` (DB trigger).
7. **Notification on every transition** (see Part C).
8. **Receipt download**: approved payments expose a PDF-style receipt (client-rendered) for both parties.

### Helpers (`src/lib/payments.ts`)
```ts
submitPayment(input)        // payer uploads proof
approvePayment(id)          // payee approves
rejectPayment(id, reason)   // payee rejects with reason
disputePayment(id, reason)  // either side
listPayments(filter)        // role-aware
computeOutstanding(leaseId) // rent due vs paid
```

### UI surfaces
- **Tenant**
  - `src/pages/tenant/Payments.tsx` (new) — outstanding rent card with "Upload payment proof" dialog; history with status badges; receipt download.
  - In `Maintenance.tsx` detail drawer: if `funded_by='tenant'` and ticket reached `tenant_verified`, show "Pay technician" button.
- **Landlord**
  - `src/pages/landlord/Payments.tsx` (new) — inbox of tenant payment submissions per lease, Approve/Reject; outgoing payments to technicians for landlord-funded tickets.
  - Lease detail shows payment ledger (month-by-month).
- **Technician**
  - New "Payments" tab — pending approvals from payer, history, payout details.
- **Admin**
  - New "Payment disputes" page — arbitrate disputed payments, override status with mandatory note.

### Payment method picker
`PaymentMethodPicker` component lets each user save 1–3 payout methods once; payer sees payee's method list when uploading proof (so they know where to send the money).

### Files for Part B
```
supabase/migrations/20260518100000_manual_payments.sql   (new)
src/lib/payments.ts                                       (new)
src/components/payments/PaymentMethodPicker.tsx           (new)
src/components/payments/SubmitPaymentDialog.tsx           (new)
src/components/payments/PaymentCard.tsx                   (new)
src/components/payments/PaymentReviewDialog.tsx           (new)
src/components/payments/ReceiptView.tsx                   (new)
src/pages/tenant/Payments.tsx                             (new)
src/pages/landlord/Payments.tsx                           (new)
src/pages/shared/Settings.tsx                             (edit — add payout methods section)
```

---

## Part C — Notifications (robust + fair)

### Schema extension (same migration)
Extend existing `notifications` table with:
- `kind` enum tightened to: `maintenance_status`, `quote_received`, `quote_accepted`, `quote_declined`, `assignment_offered`, `assignment_expiring`, `payment_submitted`, `payment_approved`, `payment_rejected`, `payment_disputed`, `payment_overdue`, `review_requested`, `dispute_opened`, `cancellation`, `system`.
- `link` (deep-link to the relevant page).
- `severity` (`info|warn|critical`).
- `dedupe_key` UNIQUE — prevents duplicate notifications for the same event.
- `read_at`, `seen_at` (separate: "seen in bell" vs "opened detail").

### Triggers (server-side, single source of truth)
A DB function `public.emit_notification(user_id, kind, title, body, link, severity, dedupe_key)` is called from triggers on:
- `maintenance_tickets` status changes
- `maintenance_quotes` insert / status change
- `maintenance_assignments` insert / response
- `payments` insert / status change
- `maintenance_reviews` insert
- `maintenance_cancellations` insert

This guarantees **no UI screen can forget to notify** — it's emitted by the DB regardless of which client triggered the change.

### Fairness rules
1. **Bidirectional**: every action notifies the counterparty AND copies the landlord for visibility on their properties.
2. **Quiet hours respected** in UI (`severity=info` collapsed after 22:00 local) — server still records them.
3. **Expiry reminders**: a daily cron-style query (admin-triggered button for now) emits `assignment_expiring` 2h before `expires_at` and `payment_overdue` for rent past due date.
4. **No spam**: `dedupe_key` blocks duplicates (e.g. `payment:{id}:approved`).

### UI
- `src/pages/shared/Notifications.tsx` (rewrite) — grouped by day, filter by kind, mark all read, deep-link via `link` field.
- Bell badge in `DashboardLayout` shows unread count via realtime channel subscription.

---

## State machine wiring (single source of truth)
All status badges, allowed actions, and labels read from `src/lib/maintenance.ts` and `src/lib/payments.ts`. No component hardcodes status strings. Helpers `allowedActions(ticket, role)` and `allowedPaymentActions(payment, role)` decide which buttons appear.

---

## Full file map
```
supabase/migrations/
  20260518100000_manual_payments.sql   (new — payments + notification triggers)

src/lib/
  maintenance.ts                       (extend — add allowedActions)
  payments.ts                          (new)

src/components/maintenance/            (8 new files — see Part A)
src/components/payments/               (5 new files — see Part B)

src/pages/tenant/
  Maintenance.tsx                      (rewrite)
  Payments.tsx                         (new)
src/pages/landlord/
  Maintenance.tsx                      (new)
  Payments.tsx                         (new)
src/pages/maintenance/
  Dashboard.tsx                        (rewrite)
  Profile.tsx                          (new)
src/pages/admin/
  Maintenance.tsx                      (new)
  PaymentDisputes.tsx                  (new)
src/pages/shared/
  Notifications.tsx                    (rewrite)
  Settings.tsx                         (edit — payout methods)

src/components/layout/DashboardLayout.tsx  (edit — nav for landlord Maintenance/Payments, tech Profile/Payments, admin Maintenance/Payment Disputes, bell unread count)
src/App.tsx                                (edit — register new routes)
```

---

## Out of scope (deliberately)
- Stripe / Paddle / card payments / Stripe Connect.
- SMS/WhatsApp notifications (in-app only).
- Automated bank-statement reconciliation (manual approval only).
- Geo-verified technician check-in.
- Calendar sync.

## Acceptance criteria
1. Landlord has a **Maintenance** tab and can dispatch a tenant ticket to ≥1 technician (broadcast).
2. Technician onboarding (skills + payout method) is required before receiving offers.
3. Quote → accept → scheduled → check-in → work_done → tenant_verified → close → mutual review all work and appear on timeline.
4. Tenant can upload rent payment proof; landlord approves/rejects with reason; auto-approve after 48h.
5. Tenant-funded ticket: tenant pays technician via proof upload; technician approves.
6. Landlord-funded ticket: landlord pays technician via proof upload; technician approves.
7. Every transition produces exactly one (deduped) notification with a deep-link.
8. Disputes route to admin queue; admin override is logged in the event table.
9. All proofs immutable after first status transition; rejection requires reason ≥10 chars.

## Scope estimate
~18 new files, 3 rewrites, 3 edits, 1 migration. About 1.5× the size of Phase 1.
Say **"go"** to start building Part A + B + C together, or **"go A first"** to ship maintenance UI before payments.
