## Goal
Rebuild maintenance + manual payments as one fool-proof three-party case workflow, mirroring proven patterns from real-world platforms: **Property Meld, Latchel, Fixflo** (property maintenance), **Jobber, Housecall Pro, ServiceTitan** (field service), and **Zendesk, Jira Service Management** (ticketing SLAs and approvals).

## Patterns being borrowed (and why)
- **Property Meld / Latchel** — single case room with tenant, landlord, vendor, with chat, photos, scheduling, invoice, and approval all attached to one ticket. We mirror this with a unified Case Room.
- **Fixflo** — guided issue reporting with category-driven photo prompts and triage questions. We mirror this with a structured intake form + mandatory photos.
- **Jobber / Housecall Pro** — quote → approval → schedule → on-my-way → check-in → work-done → invoice → payment, with timestamps on every step. We mirror this state machine and surface "next required action" everywhere.
- **ServiceTitan** — explicit approval thresholds (e.g. landlord NTE = Not-To-Exceed cap, change-orders need re-approval). We add an NTE/spending cap and change-order re-approval.
- **Zendesk / Jira** — SLA timers, escalation, audit log, deduped notifications, internal vs external notes. We add SLA countdowns, escalation to admin, immutable timeline, and internal notes vs public chat.

## Real-world principles enforced
1. **One case, one source of truth** — chat, photos, quotes, schedule, decisions, payment all live on the ticket.
2. **Nothing implicit** — every approve/reject/dispute is an explicit logged decision with a reason when negative.
3. **Payer-aware gates** — the payer (tenant or landlord) is the only one who can approve the quote, the price cap, and the final payment release.
4. **Proof in, proof out** — issue photos in, after-photos + invoice out, payment receipt to close.
5. **SLA and escalation** — first-response SLA, schedule SLA, verify SLA, payment SLA, each with auto-escalation to admin.
6. **Immutable trail** — append-only events; tamper-locked payments; signed proof URLs.
7. **Deep-linked notifications** — every notification opens the exact case room tab.

## Core lifecycle
```text
INTAKE      Tenant: structured form + photos + access notes  -> submitted
TRIAGE      Landlord: set NTE cap, funded_by, urgency        -> triaged
DISPATCH    Landlord: broadcast to N techs (first-accept)    -> dispatched
ACCEPT      Tech: accept / decline                           -> assigned
QUOTE       Tech: price + scope + window                     -> quoted
APPROVE     Payer: approve / counter / reject (reasoned)     -> scheduled
EN ROUTE    Tech: on-my-way + ETA                            -> en_route
CHECK-IN    Tech: arrived + before photos                    -> in_progress
WORK DONE   Tech: after photos + invoice                     -> work_done
VERIFY      Tenant: verify / dispute (reasoned)              -> tenant_verified | disputed
INVOICE     System auto-creates payment requirement          -> payment_due
PAY         Payer: upload proof (bank/EasyPaisa/JazzCash)    -> payment_submitted
RELEASE     Payee: approve / reject (reasoned)               -> payment_approved
CLOSE       System: only when verified AND paid              -> closed
REVIEW      Both sides: mutual 1-5 star + comment            -> reviewed
```
Side branches: **change-order** (re-quote during work), **reschedule**, **cancel** (with 24h fee rule), **dispute → admin arbitration**.

## Plan

### 1. Case Room (the headline change)
One drawer/page used by all roles with these sections, gated by role:
- **Header** — status pill, "Waiting on X", payer chip, NTE cap, SLA countdown, assigned tech.
- **Overview** — property, category, priority, access instructions, in-unit location.
- **Photos & files** — issue / before / progress / after / invoice / dispute evidence, with role filters.
- **Chat** — ticket-scoped messages between the 3 parties + optional internal notes (landlord ↔ tech only, not visible to tenant — Zendesk pattern).
- **Quotes** — full negotiation thread, accepted quote highlighted, change-order button.
- **Schedule** — proposed window, on-my-way, ETA, check-in, completion timestamps.
- **Decisions** — approval / verification / rejection log with reasons.
- **Payment** — required amount, proof, payee approval, signed-URL receipt.
- **Timeline** — immutable event log.
- **Action bar** — only shows the *next valid action* for this role.

### 2. Structured intake (Fixflo pattern)
- Category-driven mandatory fields: e.g. plumbing requires "leak/no-leak", "water shut off Y/N".
- **At least one issue photo required** (uploaded, not URL).
- Access instructions: pet on premises, key location, preferred time windows.
- Funded-by hint (tenant vs landlord) shown with clear consequences.

### 3. Ticket-scoped chat with internal notes
- New `maintenance_messages` table: `ticket_id`, `sender_id`, `audience` (`all` | `internal`), `body`, `attachment_id?`, `kind` (`general` | `quote` | `schedule` | `payment` | `dispute`).
- Tenant only sees `audience='all'`; landlord/tech/admin see both.
- Attachments via signed URLs from the same bucket as photos.
- Replaces ad-hoc DM for ticket context; generic Messages page remains for non-ticket conversations.

### 4. Robust uploads
- Private bucket `maintenance-attachments`.
- `maintenance_attachments` table: `ticket_id`, `uploaded_by`, `kind` (issue / before / progress / after / invoice / dispute_evidence / other), `storage_path`, `mime`, `bytes`, `created_at`.
- RLS: only parties on the ticket can read; uploader path-scoped.
- UI: drag-drop uploader with previews, mobile camera capture, EXIF-stripped on client.
- Hard rules: **issue photo required to submit**, **≥1 after-photo required for work_done**, **invoice attachment required for payment_due on tech-billed jobs**.

### 5. Explicit decisions (Zendesk audit pattern)
New `maintenance_decisions` table: `ticket_id`, `actor_id`, `actor_role`, `kind` (`quote_approve` | `quote_reject` | `quote_counter` | `work_verify` | `work_dispute` | `payment_approve` | `payment_reject` | `payment_dispute` | `change_order_approve` | `change_order_reject` | `cancel`), `target_id` (quote or payment), `reason`, `created_at`.
- Negative decisions need reason ≥ 10 chars.
- Every decision writes a timeline event and a deduped notification.

### 6. NTE cap + change orders (ServiceTitan pattern)
- Landlord sets **Not-To-Exceed amount** at triage.
- Any quote exceeding NTE requires explicit landlord approval even on tenant-funded jobs (landlord owns the property).
- Tech can submit a `change_order` quote mid-job; status → `change_order_pending`; payer must re-approve before work resumes.

### 7. SLA timers + escalation (Zendesk pattern)
- First-response SLA (dispatch within X hours of submit, by priority).
- Schedule SLA (quote → scheduled within Y hours).
- Verify SLA (work_done → auto-verify in 72h).
- Payment SLA (payment_due → proof in 7d, proof → review in 48h).
- Breach → notification escalates to admin queue.
- Visible countdown in case-room header.

### 8. Payment release tied to ticket close
- When status becomes `tenant_verified` (or admin-resolved dispute), system creates a `payments` row in `payment_due` state for the correct payer/payee.
- Payer uploads proof → `submitted` → payee approves/rejects.
- Ticket can only `close` when: work verified AND payment approved (or admin override with reason).
- Refunds: `refund_requested` flow with admin arbitration.

### 9. Cancellation fairness (already partly in code)
- Free cancel >24h before scheduled start.
- Inside 24h: 10% of accepted quote owed by the cancelling party to the counterparty, auto-recorded as a `cancellation_fee` payment.
- Tech no-show = automatic dispute, no fee from tenant/landlord.

### 10. Mutual reviews
- Tenant → tech, landlord → tech, tech → tenant (cleanliness/access).
- 1–5 stars + optional comment; aggregated to tech rating that gates dispatch eligibility (already wired).

### 11. Notifications upgrade
- Use existing `emit_notification` with `dedupe_key` and `link`.
- Add deep-links of form `/app/{role}/maintenance?ticket=<id>&tab=chat|quotes|payment|photos`.
- Cover: new message, offer, accept/decline, quote, counter, schedule, en-route, check-in, work-done, verify, dispute, payment-due, proof-submitted, proof-approved, proof-rejected, change-order, SLA breach, ticket closed, review requested.

### 12. Admin arbitration queue
Admin Maintenance page already planned — extend with:
- Disputed tickets, disputed payments, SLA breaches.
- Force-close, force-approve payment (with reason), reassign tech, refund.

## Technical details

### Migrations (single new SQL file)
- `maintenance_messages` (+ RLS)
- `maintenance_attachments` (+ RLS) + storage bucket `maintenance-attachments` + storage policies
- `maintenance_decisions` (+ RLS)
- Add columns to `maintenance_tickets`: `nte_amount bigint`, `access_notes text`, `location_in_unit text`, `intake_answers jsonb`, `en_route_at`, `eta_at`, `waiting_on text` (computed via trigger).
- Add status values: `assigned`, `en_route`, `change_order_pending`, `payment_due`, `payment_submitted`, `payment_approved`.
- Triggers: keep `waiting_on` and `sla_due_at` in sync; on `tenant_verified` auto-create `payments` row in `payment_due`; on `payment.status='approved'` + verified, auto-close (or surface "Ready to close").
- Notification triggers for messages, attachments, decisions, change orders, SLA breaches.

### Helpers
- `src/lib/maintenanceMessages.ts` — send/list/realtime subscribe.
- `src/lib/maintenanceAttachments.ts` — upload, signed URL, list by kind.
- `src/lib/maintenanceDecisions.ts` — record decision + reason.
- Extend `src/lib/maintenance.ts` — `getChecklist(ticket)`, `nextRequiredAction(ticket, role)`, `canClose(ticket)`, `slaCountdown(ticket)`.
- Extend `src/lib/payments.ts` — `ensureTicketPayment(ticket)`, `ticketPaymentSummary(ticketId)`.

### Components
- `MaintenanceCaseRoom` (replaces current drawer body with tabbed sections).
- `TicketChatPanel` (+ internal-notes toggle).
- `AttachmentUploader` / `AttachmentGallery` (kind-filtered).
- `DecisionPanel` (approve / counter / reject buttons with reason).
- `TicketChecklist` (the 9-row checklist).
- `PaymentStatusPanel` (proof, signed URL, approve/reject).
- `SlaBadge` (countdown + breach state).
- `WaitingOnChip` (e.g. "Waiting on landlord approval").

### Refactors
- `TicketDetailDrawer` → thin wrapper around `MaintenanceCaseRoom`.
- Tenant/Landlord/Tech/Admin Maintenance pages → list + open Case Room; lose ad-hoc forms.
- Notifications page → respect `link` field for deep-link click-through.

## Acceptance criteria
- Tenant cannot submit ticket without category-required fields and ≥1 issue photo.
- Landlord must set NTE + funded_by before dispatch.
- Quote above NTE always needs landlord approval.
- Tech cannot mark work_done without ≥1 after-photo and invoice (if billable).
- Tenant verify or dispute is explicit and reasoned; auto-verify after 72h.
- Ticket cannot close until verified AND payment approved (or admin override).
- Change-orders require re-approval before work resumes.
- All chat, photos, quotes, decisions, payment events, and SLA breaches appear in one immutable timeline.
- Every notification deep-links to the right tab of the case room.
- Disputes route to admin queue with full evidence visible.

## Out of scope (will not implement)
Stripe/automated payouts, SMS/WhatsApp, GPS-verified check-in, calendar sync, OCR of invoices, photo AI tagging.