## Goal
Make the existing maintenance + payment flow feel robust and complete without adding heavy enterprise machinery. Focus on the three things users actually feel are missing: **real photo uploads, ticket-scoped chat, and a clear payment handoff that gates ticket close**.

## What we will NOT add (kept out to stay simple)
- No NTE/spending caps
- No SLA timers / auto-escalation
- No internal-notes split
- No change-order re-approval flow
- No structured intake questionnaires
- No admin arbitration queue rewrite
- No EXIF stripping, OCR, AI tagging

These can come later. We focus on the fool-proof minimum.

## Plan

### 1. Real photo & file uploads (replaces URL inputs)
- New private storage bucket `maintenance-attachments`.
- New table `maintenance_attachments` with: `ticket_id`, `uploaded_by`, `kind` (`issue` | `after` | `invoice` | `other`), `storage_path`, `mime`, `created_at`.
- RLS: only ticket parties (tenant, landlord of property, assigned tech, admin) can read/insert.
- New component `AttachmentUploader` + `AttachmentGallery` (signed URLs).
- Tenant: can attach issue photos when submitting the ticket.
- Technician: must upload at least one **after** photo before marking work done (remove the raw URL textarea).
- Landlord/admin: view-only.

### 2. Ticket-scoped chat
- New table `maintenance_messages`: `ticket_id`, `sender_id`, `body`, `created_at`.
- RLS: only ticket parties can read/insert.
- New component `TicketChatPanel` inside the ticket drawer; realtime via Supabase channel.
- Notification on new message via existing `emit_notification` (deduped per sender per minute).

### 3. Clear payment handoff that gates close
- When a ticket reaches `tenant_verified`, a trigger creates a `payments` row in status `submitted` is wrong — instead create a lightweight "payment requirement" by inserting a placeholder row with status `pending_proof` (new status), payer = funded_by side, payee = assigned technician, amount = accepted quote price.
- Payer sees a clear "Pay technician" action in the case drawer (already exists) and uploads proof through the existing `SubmitPaymentDialog` (already exists). On submit, the placeholder row is updated rather than a new row created.
- Ticket can only move to `closed` when:
  - status is `tenant_verified` AND
  - linked payment is `approved` (or admin override).
- Add a small **TicketChecklist** in the drawer:
  - Issue photos ✔
  - Quote accepted ✔
  - Scheduled ✔
  - After photos ✔
  - Verified by tenant ✔
  - Payment proof ✔
  - Payment approved ✔
  - Ready to close ✔

### 4. Reasoned approvals
- Tenant verify keeps as-is (one click).
- Tenant **dispute** already requires ≥10 chars — keep.
- Quote reject already supported — make sure a reason field is shown and stored in `maintenance_events.payload.reason` (small UI patch, no schema change).

### 5. Minor cleanups
- Tenant Maintenance form: add photo uploader (issue kind).
- Tech "Mark work done" panel: replace URL textarea with `AttachmentUploader` (after kind), then call `markWorkDone` with the resulting storage paths.
- Drawer: add Chat + Attachments + Checklist sections.
- Notifications: keep existing triggers; add one for new chat message.

## Technical details

### Single new migration
- Create `maintenance-attachments` storage bucket + storage RLS.
- Create `maintenance_attachments` table + RLS.
- Create `maintenance_messages` table + RLS + realtime publication.
- Extend `payments.status` check to include `pending_proof`; update existing payment trigger to skip notifying on `pending_proof → submitted` (it’s the payer’s own proof upload, already obvious).
- Add trigger on `maintenance_tickets`: when status transitions to `tenant_verified`, insert one `payments` row in `pending_proof` for funded_by → assigned_to with the accepted quote price (only if not already created).
- Add trigger on `payments`: when status becomes `approved` and the linked ticket is `tenant_verified`, update ticket to `closed`.
- Add notification trigger on `maintenance_messages` (deduped per ticket per minute).

### New files
- `src/lib/maintenanceAttachments.ts` — `uploadAttachment`, `listAttachments`, `getSignedUrl`.
- `src/lib/maintenanceMessages.ts` — `sendMessage`, `listMessages`, `subscribe`.
- `src/components/maintenance/AttachmentUploader.tsx`
- `src/components/maintenance/AttachmentGallery.tsx`
- `src/components/maintenance/TicketChatPanel.tsx`
- `src/components/maintenance/TicketChecklist.tsx`

### Edited files
- `src/pages/tenant/Maintenance.tsx` — add issue-photo uploader to submit form.
- `src/components/maintenance/TicketDetailDrawer.tsx` — add Chat, Attachments, Checklist sections; replace after-photo URL input with uploader; payment button reads the pending_proof row.
- `src/lib/maintenance.ts` — small helper `getChecklist(ticket, attachments, payment)`.

## Acceptance criteria
- Tenant submits a ticket with at least one issue photo (uploaded, not URL).
- All three parties can chat inside the ticket drawer in realtime.
- Technician cannot mark work done without uploading an after photo.
- When tenant verifies, a payment requirement appears automatically for the correct payer.
- Payer uploads proof; payee approves or rejects with reason.
- Ticket closes only when verified AND payment approved.
- Every step triggers a notification with a link to the ticket.

## Scope
1 migration, 2 helpers, 4 small components, 3 edited files. Roughly half the size of the previous plan.