# Fair, mutual, court-defensible lease lifecycle

## Why the current screens fail today

1. **Schema not applied.** Migration `0007_lease_lifecycle.sql` exists locally but was never pushed to Lovable Cloud — every column it adds (`end_reason`, `notice_period_days`, `current_version_id`, …) is missing live. That is the red "Could not find the 'end_reason' column" toast and the empty "Notice period: days" line in both screenshots.
2. **Termination is unilateral.** `terminateLease()` flips status the instant either party clicks. That is not defensible — Pakistani rent law (Punjab Rented Premises Act 2009 §16–17, Sindh Rented Premises Ordinance 1979 §15) only allows ejectment / surrender on specified grounds, after written notice, served on the other party.
3. **No renewal, extension, amendment, move-out, or deposit-return flow** anywhere in the app.

## Real-world model we will copy

Modeled on Punjab Rented Premises Act 2009 + how Zillow Rental Manager, Avail, OpenRent (UK) and Rentec handle the same problem:

```text
DRAFT ─► OFFER (signed snapshot) ─► both sign ─► ACTIVE
                       ▲                              │
                       │                              ├─► AMENDMENT request  (mid-term change of any clause)
                       │                              ├─► EXTENSION request  (same terms, push end_date)
                       │                              ├─► RENEWAL offer      (new term, new rent — fresh signed version)
                       │                              ├─► TERMINATION notice (with statutory notice + ground)
                       │                              └─► NATURAL EXPIRY     (end_date reached → HOLDOVER until renewed or ended)
                       │                                                     │
                       └──────── counter / accept / decline ◄────────────────┘
                                                                             ▼
                                                                MOVE-OUT INSPECTION
                                                                          ▼
                                                                DEPOSIT SETTLEMENT
                                                                          ▼
                                                                       ENDED
```

Every state change after activation **requires the counter-party's explicit click** before it takes effect. Nothing is silent, nothing is one-sided.

## Legal scaffolding (so it survives an FIR / Rent Controller hearing)

Add these to every signed event — they are the things judges and Rent Controllers actually ask for:

| Requirement | How we implement it |
| --- | --- |
| Written tenancy | `lease_versions.terms` (JSON) + `terms_hash` (SHA-256). Hash printed on the PDF. |
| Identity of both parties | `profiles.cnic` (13-digit) — **add now, required to sign**. Stored hashed for privacy, verified by CNIC photo upload to existing storage bucket. |
| Free, informed consent | Two-click sign: (1) "I have read the agreement" checkbox + (2) OTP delivered to the registered phone number, valid 10 min. `lease_signatures.otp_verified_at` becomes real, not a placeholder. |
| Date, time, IP, device | Already in `lease_signatures` — make sure we actually capture `ip` (currently null) via a tiny server function. |
| Statutory notice period | Configurable per lease, **floor enforced server-side** (30 days residential per Punjab Act §15(1) unless lease says more). Cannot be bypassed by either side. |
| Grounds for termination | Enum, not free text: `mutual_agreement`, `tenant_notice`, `landlord_notice`, `non_payment` (≥2 months arrears per Punjab Act §15(2)(a)), `material_breach`, `personal_bona_fide_need` (§15(2)(f)), `end_of_term`, `property_unfit`. Free-text "details" allowed in addition. |
| Rent escalation cap | Default 10 % / year (Punjab Act §6). Stored on the lease; UI warns if a renewal exceeds it. |
| Deposit cap | Soft-warn if deposit > 3 × monthly rent (market norm; Sindh Ordinance §6 caps at 2 months for some classes — we surface a warning, do not block). |
| Immutable audit | `lease_events` is already append-only via RLS (no UPDATE/DELETE policies). We will keep it that way and **expose it as a "Lease history" timeline** on both dashboards — that is the evidence a court reads. |
| Tamper-evident terms | Every amendment / renewal creates a **new** `lease_versions` row whose hash chains to `prev_version_id`. Old versions are never edited. |
| Mutuality | A second table, `lease_requests`, holds every proposed change as `pending` until the other side accepts. The lease itself only mutates when both parties have signed the resulting new version. |

## Plan

### Step 1 — Push the missing schema + add the mutual primitives

New migration `db/migrations/0008_lease_lifecycle_mutual.sql` (idempotent):

- **Re-runs 0007** (already safe — every statement is `if not exists` / `drop policy if exists`). Fixes the red toast immediately.
- **`profiles.cnic`** (text, nullable until first sign; unique; format checked `^\d{13}$`).
- **`lease_requests`** table:
  ```sql
  create table public.lease_requests (
    id uuid primary key default gen_random_uuid(),
    lease_id uuid not null references public.leases(id) on delete cascade,
    kind text not null check (kind in
      ('amendment','extension','renewal','termination','holdover_decision')),
    status text not null default 'pending'
      check (status in ('pending','accepted','declined','countered','withdrawn','expired','superseded')),
    requested_by uuid not null references auth.users(id),
    -- Payload (only the columns relevant to `kind` are populated)
    proposed_terms jsonb,     -- amendment / renewal: full new LeaseTerms
    new_end_date date,        -- extension / renewal
    effective_date date,      -- termination (= notice_served_at + notice_period_days)
    ground text,              -- termination ground enum (see table above)
    ground_details text,      -- free text supporting the ground
    notice_served_at timestamptz default now(),
    responded_by uuid references auth.users(id),
    responded_at timestamptz,
    created_at timestamptz not null default now()
  );
  ```
  Partial unique index: only **one** `pending` request per `(lease_id, kind)` at a time, so two people cannot race conflicting requests.
- **RLS**: both parties may `select` and `insert`; only the *other* party may `update` (accept / decline / counter); only the requester may withdraw while still `pending`.
- **`lease_inspections`** (move-in + move-out): photos + condition notes signed by both parties. Reuses the existing storage bucket.
- **`deposit_ledger`** already exists from 0007 — add a trigger so an `accepted` termination request opens a **deposit settlement** row that both parties must acknowledge before the lease flips to `ended`.
- **Triggers** (`security definer`, `search_path = public`):
  - `on_request_accepted` — applies the change atomically: amendment → new `lease_versions` row, lease re-enters "pending re-signature"; extension → updates `end_date` only; renewal → new version + new sign round; termination → schedules `ended_at = effective_date`, status becomes `terminated` only after both parties acknowledge the deposit settlement.
  - `on_holdover` — nightly job (DB function called by `pg_cron` via a free Lovable Cloud schedule, or a cheap `setInterval` ping from a server fn) sets `status='holdover'` when `now() > end_date` and the lease is still `active` and no renewal is pending. Holdover continues month-to-month at the last agreed rent (Punjab Act §17), so we do not auto-terminate.
  - `on_arrears_breach` — if `deposit_ledger` shows ≥ 2 months of unpaid `rent` rows, a `termination` request with ground `non_payment` is **enabled** for the landlord (but still requires the same notice + tenant response — never auto-terminates).

### Step 2 — `src/lib/lease.ts` rewrite around mutuality

Replace single-party helpers with the request-based API. Existing happy-path helpers (`sendInitialOffer`, `counterOffer`, `signCurrentVersion`) stay — they already work mutually.

```ts
requestAmendment({ leaseId, by, proposedTerms, reasonNotes })
requestExtension({ leaseId, by, newEndDate })
requestRenewal({ leaseId, by, proposedTerms })          // new term, new rent
serveTerminationNotice({ leaseId, by, ground, groundDetails, effectiveDate })
respondToRequest({ requestId, decision: 'accept'|'decline'|'counter', counterPayload? })
withdrawRequest({ requestId })
acknowledgeDepositSettlement({ leaseId, by })
recordInspection({ leaseId, by, kind: 'move_in'|'move_out', photos, notes })
```

Server-side guards (enforced in the DB trigger, not just the UI — UI rules are not court evidence):

- `effectiveDate >= notice_served_at + lease.notice_period_days` (statutory minimum 30 days).
- Tenant cannot serve termination during `lock_in_months` without paying out the remainder (request is still allowed; UI computes the penalty and pre-fills the deposit ledger).
- Renewal rent cannot exceed previous rent × (1 + `escalation_pct`/100) **per year of new term** unless the tenant explicitly clicks "I agree to the increase above the statutory cap".
- `serveTerminationNotice` for ground `non_payment` blocked unless the arrears trigger has fired.

`terminateLease()` is removed from the public API. The "Terminate lease" button in `landlord/Leases.tsx` (line 259) and "Request to end lease early" in `tenant/Lease.tsx` both rewrite to `serveTerminationNotice` → dialog → counter-party must acknowledge.

### Step 3 — Real signing (replaces today's placeholder)

`signCurrentVersion()` becomes:

1. Dialog shows the full agreement, the SHA-256 hash, both CNICs, and an "I have read and agree" checkbox.
2. On click, a server function (`/api/sign-otp`) sends a 6-digit OTP to `profiles.phone` (re-uses the existing Lovable Cloud SMS slot; falls back to email until a provider is wired).
3. On correct OTP, the server function captures `ip` from the request, then inserts the `lease_signatures` row with `otp_verified_at = now()`.

This is the single biggest court-defensibility upgrade. Without it, a defendant can claim "someone else clicked Sign".

### Step 4 — Landlord dashboard (`src/pages/landlord/Leases.tsx`)

On every **Active** card:

- A "Pending request" banner whenever a `lease_requests` row exists for the lease — shows who proposed what, when, the effective date, and **Accept / Counter / Decline** buttons (replaces the current native `prompt()` from screenshot 1).
- Action bar: `Message tenant` · `Propose amendment` · `Propose extension` · `Offer renewal` · `Serve termination notice` · `Record move-out inspection`.
- A right-rail **Lease history** timeline rendered from `lease_events` (offer sent, countered, signed, amended, renewed, notice served, terminated, deposit acknowledged). This is the exhibit list for any future hearing.
- Inline read-out of `notice_period_days`, `lock_in_months`, `escalation_pct` so both parties always see the rules they signed up to.

A new **Renewal reminder** card appears 60 days before `end_date` (industry standard — Zillow / Avail use 60 – 90) prompting the landlord to either offer renewal or serve a non-renewal notice; doing nothing rolls the lease into `holdover`.

### Step 5 — Tenant dashboard (`src/pages/tenant/Lease.tsx`)

Mirror image of Step 4 — same banner, same action bar (with tenant-appropriate phrasing: "Propose change", "Request extension", "Accept renewal", "Serve notice to vacate"), same lease-history timeline.

The "Request to end lease early" dialog (screenshot 3) becomes a real form:

- Pre-fills `effective_date` = today + `notice_period_days`.
- If still inside `lock_in_months`, shows the computed penalty and warns: *"You can still serve notice, but the landlord may deduct PKR X from your deposit per your signed agreement."*
- Submits as `serveTerminationNotice` — **does not** end the lease until the landlord acknowledges and the deposit settlement is signed by both sides.

### Step 6 — Deposit settlement & move-out

When a termination request is accepted, the lease enters `pending_closure`:

1. Both parties record / agree the move-out inspection (photos + notes).
2. Landlord posts an itemized `deposit_ledger` settlement (deductions with reasons + receipts).
3. Tenant accepts or disputes line-by-line. Acceptance flips the lease to `ended` and frees the property (existing `on_lease_closed` trigger). Dispute creates a `complaints` row routed to admin mediation (table already exists from migration 0005).

### Step 7 — PDF receipt of every signed version

After both parties sign any version (initial, amendment, renewal), generate a deterministic PDF (`pdf-lib`, already Worker-compatible) containing the full terms, both CNICs, both signature timestamps with IP + UA, and the SHA-256 hash. Stored in the existing `documents` bucket, downloadable by either party. **This is the document a Rent Controller or police station will physically ask for.**

### Out of scope (call out so we do not scope-creep)

- E-stamp paper integration with Punjab/Sindh stamp duty portal (manual for now; PDF is good enough for most disputes).
- Online rent collection / Stripe — separate task.
- Admin mediation UI for disputed deposit deductions — backend table exists, UI later.
- Witness signatures (`lease_signatures.role='witness'` already supported in schema; UI not added yet).

## Technical summary

- **New migration**: `db/migrations/0008_lease_lifecycle_mutual.sql` (re-runs 0007, adds `profiles.cnic`, `lease_requests`, `lease_inspections`, triggers, partial unique indexes, holdover/arrears jobs).
- **Rewrites**: `src/lib/lease.ts` (request-based API + real OTP signing).
- **New server functions** under `src/lib/lease.functions.ts`: `signWithOtp`, `sendSignOtp`, `generateLeasePdf`.
- **UI**: `src/pages/landlord/Leases.tsx` and `src/pages/tenant/Lease.tsx` get the pending-request banner, action bar, and `LeaseHistory` timeline. New shared components in `src/components/lease/`: `RequestBanner.tsx`, `AmendmentDialog.tsx`, `ExtensionDialog.tsx`, `RenewalDialog.tsx`, `TerminationDialog.tsx`, `DepositSettlement.tsx`, `MoveOutInspection.tsx`, `LeaseHistory.tsx`.
- **No new dependencies** except `pdf-lib` (Worker-compatible, ~80 KB) for the signed-agreement PDF.
- **No env changes** for the core flow; SMS OTP needs a provider key later, falls back to email OTP via the existing Resend wiring until then.

## Decisions I need from you before coding

1. **OTP delivery** — SMS (needs a provider — Twilio / Telenor / Jazz) or **email-only OTP** to start? I will default to email-only with a clearly-labeled "SMS coming soon" so the flow works end-to-end today.
2. **Lock-in penalty formula** — `remaining_lock_in_months × monthly_rent`, or just `1 × monthly_rent` flat? Default: the former (industry standard, matches Punjab Act §16 jurisprudence).
3. **Rent escalation cap on renewal** — hard-block above 10 %, or soft-warn and require tenant's explicit checkbox? Default: soft-warn + checkbox (gives landlords flexibility in the luxury segment).
4. **CNIC verification** — accept self-entered + photo upload now, or block signing until an admin manually verifies? Default: self-entered now, admin-verification badge later.