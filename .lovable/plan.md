# Secure document exchange — Plan

## What we're building

Two-way document upload between tenants and landlords, enforced by RLS and signed URLs (same pattern already used for `maintenance-photos`).

**Tenant uploads (per application):**
- CNIC — required
- Proof of income (payslip *or* bank statement) — required
- Employment letter — optional
- Police / security clearance — optional

**Landlord uploads (per property):**
- Ownership proof / title
- Society NOC letter

**Visibility rules:**
- Landlord can see a tenant's docs only after marking the application `under_review` or later (consent-gated).
- Tenant can see a property's documents only after their application is `approved` or they have an active lease.
- On application `rejected` or `cancelled` → tenant's docs for that application are **auto-deleted immediately** (storage + row).

## User flow

**Tenant — Apply page**
1. Picks property → clicks Apply.
2. Submit button is disabled until CNIC + one income proof are uploaded.
3. After approval, a new "Property documents" section appears on their Lease page with ownership/NOC docs from the landlord.

**Landlord — Applications inbox**
1. New application arrives as `pending`. Documents section shows "Tenant has shared documents. Mark as Under Review to view." (button).
2. Clicking *Mark under review* flips status → docs become viewable inline (preview via short-lived signed URL, no public link).
3. Each view writes an audit row so the tenant can see "Landlord viewed your bank statement 2h ago" on their Application detail.

**Landlord — Listing form**
- New "Property documents" panel where they upload ownership/NOC once per property.

## Technical design

### Storage
- Reuse the existing private `documents` bucket.
- Path conventions:
  - Tenant: `applications/{application_id}/{tenant_id}/{kind}-{timestamp}.{ext}`
  - Landlord: `properties/{property_id}/{landlord_id}/{kind}-{timestamp}.{ext}`
- Storage policies pin the first folder + uploader identity; no public reads.
- Access always via `createSignedUrl(path, 600)` — 10 min expiry.

### New tables

```text
application_documents
  id uuid pk
  application_id uuid fk -> applications(id) on delete cascade
  tenant_id uuid fk -> auth.users(id)
  kind enum: cnic | payslip | bank_statement | employment_letter | police_clearance
  storage_path text
  mime text
  size_bytes int
  created_at timestamptz

property_documents
  id uuid pk
  property_id uuid fk -> properties(id) on delete cascade
  landlord_id uuid fk -> auth.users(id)
  kind enum: ownership | society_noc
  storage_path text
  mime text
  size_bytes int
  created_at timestamptz

document_access_log     -- audit trail
  id uuid pk
  document_table text   -- 'application_documents' | 'property_documents'
  document_id uuid
  viewer_id uuid
  viewed_at timestamptz default now()
```

### RLS policies (key ones)

`application_documents`:
- `SELECT`: tenant owns the row, OR landlord of the related property AND application.status IN (`under_review`, `offer_sent`, `approved`, `fulfilled`).
- `INSERT`: only `auth.uid() = tenant_id` AND application belongs to them AND status is `pending`/`under_review`.
- `DELETE`: tenant owns it, OR a trigger fires on application status change to `rejected`/`cancelled`.

`property_documents`:
- `SELECT`: landlord owns it, OR `auth.uid()` has an `approved`/`fulfilled` application or an `active`/`pending_activation` lease on the property.
- `INSERT`/`DELETE`: only the property's landlord.

`document_access_log`:
- `INSERT`: any authenticated user (logs their own views).
- `SELECT`: tenant sees logs for their own docs; landlord sees logs for their property docs.

### Auto-purge on rejection

Postgres trigger on `applications` AFTER UPDATE: if `NEW.status IN ('rejected','cancelled')` → delete from `application_documents` where `application_id = NEW.id`. A second trigger on `application_documents` BEFORE DELETE calls a helper to also remove the storage object (via `storage.objects` delete in the same transaction, scoped to bucket = `documents`).

### Validation (client + server)
- Allowed mime: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
- Max size: 10 MB. Enforced in upload helper and as a CHECK on `size_bytes`.
- Zod schemas mirror the enums for `kind`.

### Files to add / change

New:
- `supabase/migrations/<ts>_documents.sql` — tables, enums, RLS, triggers.
- `src/lib/documents.ts` — `uploadAppDoc`, `uploadPropertyDoc`, `listAppDocs`, `listPropertyDocs`, `getDocSignedUrl`, `logView`, `deleteAppDoc`.
- `src/components/documents/DocumentUploader.tsx` — generic uploader with `kind` + bucket scope.
- `src/components/documents/DocumentList.tsx` — preview + signed-url open + view-log badge.

Modify:
- `src/pages/public/PropertyDetail.tsx` (or wherever Apply lives) — add required uploader section, block submit until required docs present.
- `src/pages/landlord/Applications.tsx` — new "Documents" panel that unlocks on *Mark under review*.
- `src/pages/landlord/ListingForm.tsx` — add Property documents panel.
- `src/pages/tenant/Lease.tsx` — show approved property's documents.
- `src/pages/tenant/Applications.tsx` — show "landlord viewed X" badges from `document_access_log`.

## Out of scope (explicit)
- OCR / automatic income parsing.
- Watermarking previews.
- Virus scanning (can add later via Edge function).
- Tenant-side download blocking (we allow download for now; can switch to preview-only later).

## Acceptance criteria
1. Tenant cannot submit application without CNIC + one income proof.
2. Landlord sees "documents locked" on `pending`; sees and can preview docs once they click *Mark under review*.
3. Tenant sees ownership/NOC docs on Lease page once application is approved.
4. Rejecting an application removes both DB rows and storage objects for that application's docs.
5. Every doc open writes to `document_access_log` and shows up on tenant's app detail.
6. All file access uses signed URLs ≤10 min; no public storage URLs exist.

Approve to proceed, or tell me what to tweak (e.g., add tenant rental history as a required doc, change purge window, add watermarking).