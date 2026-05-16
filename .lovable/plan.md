## What changes

### Part A — Documents move to the Apply form

**`src/pages/public/PropertyDetail.tsx`** — replace the simple message-only apply panel with a two-step apply flow:

1. **Step 1 (always visible):** message textarea + the same uploaders the tenant currently sees post-submit (CNIC, payslip OR bank statement, optional employment letter, optional police clearance). Files are uploaded to a **temporary holding area** (storage path: `applications/_draft/{user_id}/{kind}-{ts}.{ext}`) because the `application_id` does not exist yet.
2. **Step 2 — "Submit application" button:**
   - Disabled until **CNIC + (payslip OR bank statement)** are present.
   - On click: insert the `applications` row → for each draft file, move/copy the storage object to `applications/{newAppId}/{user_id}/...` and insert the corresponding `application_documents` row → cleanup `_draft` folder.

**`src/pages/tenant/Applications.tsx`** — keep the per-row docs panel for **add / replace / delete** after submission (covers the "I forgot to attach my payslip" case), but the panel is no longer the primary upload entry point. Drop the "Docs incomplete" badge logic since submission now guarantees completeness; replace it with a simple "X documents shared" count.

**`src/lib/documents.ts`** — add two helpers:
- `uploadDraftAppDoc(file, kind)` → writes to `_draft` path, returns `{ path, kind, mime, size }`.
- `promoteDraftDocs(applicationId, drafts)` → server-side move + `application_documents` insert in a single batch, with rollback on failure.

**Storage RLS** — extend the `can_access_document_path` function so a user can read/write objects under `applications/_draft/{their_uid}/*`. Auto-cleanup: a scheduled `pg_cron` job (or simple `BEFORE INSERT` trigger on `application_documents`) removes `_draft` objects older than 24 h.

### Part B — Deposit-gated lease activation

**`src/lib/lease.ts` — `signCurrentVersion`:**
When both parties have signed, set `status = 'pending_activation'` **instead of** `active`. Do NOT stamp `activated_at` yet. Then immediately create the deposit payment row:

```sql
INSERT INTO payments (context, lease_id, payer_id, payee_id, amount, method, status, ...)
VALUES ('deposit', lease.id, tenant_id, landlord_id, lease.deposit, 'bank', 'submitted'... )
```

Actually — to match the existing manual-payment flow we should NOT pre-create a `submitted` row (the tenant needs to attach proof). Instead:
- On both-signed: set `status = 'pending_activation'`, log `awaiting_deposit` event.
- Surface a prominent "Pay security deposit ({formatPKR(deposit)}) to activate your lease" CTA on the tenant Lease card → opens the existing `SubmitPaymentDialog` pre-filled with `context='deposit'`, `lease_id`, `amount=deposit`, `payee_id=landlord`.
- Surface a matching "Awaiting tenant deposit" badge on the landlord Lease card.

**New activation trigger** — `supabase/migrations/<ts>_lease_activation.sql`:

```sql
CREATE OR REPLACE FUNCTION public.activate_lease_on_deposit_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.context = 'deposit'
     AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.leases
       SET status = 'active', activated_at = NOW()
     WHERE id = NEW.lease_id AND status = 'pending_activation';
    INSERT INTO public.lease_events (lease_id, kind, payload)
    VALUES (NEW.lease_id, 'activated', jsonb_build_object('via_payment', NEW.id));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_activate_lease_on_deposit
AFTER UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.activate_lease_on_deposit_approval();
```

So the flow is: tenant submits deposit proof → landlord clicks **Approve** in Payments tab → trigger flips lease to `active` and writes the audit event.

**`src/pages/tenant/Lease.tsx` and `src/pages/landlord/Leases.tsx`:**
- Add `pending_activation` branch in `ActiveCard` / landlord lease card with the deposit CTA / status copy above.
- Show `LeaseLifecyclePanel` only for `active`+ statuses (already the case).

**`src/pages/landlord/Tenants.tsx`:**
Keep counting `pending_activation` as "current tenant" (it already is in `ACTIVE_STATUSES`), so the sidebar count stops showing 0 once the lease is signed even if deposit hasn't cleared yet. Add a small "Awaiting deposit" sub-badge.

## Out of scope
- Migration is assumed already applied for `application_documents` / `property_documents` (you confirmed).
- No changes to OTP signing, escrow, or refund handling.

## Acceptance criteria
1. On `/properties/:id`, the **Apply** button is disabled until CNIC + one income proof are attached; submission creates the application AND the document rows atomically.
2. Tenant Applications page still allows replacing/adding docs after submission (no badge needed).
3. After both parties sign, lease status is `pending_activation` (NOT `active`); `activated_at` is null.
4. Tenant Lease page shows "Pay security deposit to activate" CTA; clicking it opens SubmitPaymentDialog pre-filled with `context=deposit, amount=lease.deposit`.
5. When the landlord approves that deposit payment, the lease flips to `active` and a `lease_events` row of kind `activated` is written.
6. Landlord Tenants tab shows the tenant immediately when the lease is `pending_activation`, with an "Awaiting deposit" sub-badge that disappears on activation.
