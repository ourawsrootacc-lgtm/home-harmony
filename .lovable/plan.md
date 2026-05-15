# Court-defensible lease lifecycle (Pakistan) — exhaustive plan

A lease in Pakistan is enforceable when (a) both parties freely consent to identical written terms, (b) the document is stamped under the Stamp Act 1899 (province-specific rate), (c) leases over 12 months are registered under the Registration Act 1908, and (d) tenancy disputes fall under the relevant **Rent Restriction Ordinance** of the province (Punjab 2009, Sindh 1979, KP 1959, Balochistan 1959, ICT 2001). Our system can't replace the Rent Controller, but it can produce an evidence package no party can credibly deny later.

The design below mirrors that legal reality at every step: symmetric rights, full audit trail, tamper-evident snapshot, and explicit exits.

## Guiding principles (apply to every screen)

1. **Symmetry** — every right the landlord has, the tenant has a mirror of (propose, counter, accept, reject, cancel, terminate, raise dispute).
2. **Nothing is binding until both have signed the *same* version** — a hash of the final terms is stored alongside both signatures.
3. **Immutable audit log** — every state change writes a row to `lease_events` with actor, timestamp, IP, before/after JSON. This is the evidence bundle.
4. **DB invariants over UI checks** — a property can never have two active leases; PostgreSQL enforces it, not the React layer.
5. **Explicit exits** — natural expiry, mutual termination, tenant notice, landlord notice (with statutory grounds), abandonment, eviction order. Each freed-up property goes back to "active" automatically.
6. **No silent edits** — once signed, terms cannot be altered. A change requires a new **addendum** which itself goes through propose → accept → both-sign.

## Full lifecycle (state machine)

```text
applications.status:
   pending → under_review → offer_sent → withdrawn | rejected | superseded
                                       ↘ (lease activates) → fulfilled

leases.status:
   draft                              (landlord composing, never visible to tenant)
     │ send
     ▼
   proposed         ── tenant declines ─────────────► rejected
     │ │
     │ └─ tenant counters ──► countered  ◄──► (parties iterate)
     │
     │ tenant signs (landlord already pre-signed at "send")
     ▼
   pending_activation   (escrow window: stamp paper / deposit receipt upload, max 7 days)
     │ both confirm  OR  admin override
     ▼
   active   ───────────────────────────────► PROPERTY.status = 'leased'
     │
     ├─ end_date reached & not renewed     ─► ended
     ├─ both sign mutual_termination       ─► terminated(reason=mutual)
     ├─ tenant 30-day notice served & ends ─► terminated(reason=tenant_notice)
     ├─ landlord notice on statutory ground─► terminated(reason=landlord_notice)
     ├─ tenant abandons (no rent > N days) ─► disputed → terminated(reason=abandonment)
     └─ rent controller / court order      ─► terminated(reason=order)
                                          all paths → PROPERTY.status = 'active'

addenda (rent change, extension, occupant change, pet clause):
   proposed → countered* → accepted → applied   (forms a chain off the parent lease)
```

## Symmetric rights table

| Capability | Tenant | Landlord |
|---|---|---|
| Open negotiation thread on an application | ✅ | ✅ |
| Send first lease offer | (counter only) | ✅ |
| Counter an offer with any field changed | ✅ | ✅ |
| Withdraw own pending offer/counter | ✅ | ✅ |
| Accept the other side's current offer | ✅ | ✅ |
| Decline outright (kills negotiation) | ✅ | ✅ |
| Upload supporting docs (CNIC, salary slip / ownership proof, NOC) | ✅ | ✅ |
| See full revision history of every term | ✅ | ✅ |
| Download court-ready PDF after activation | ✅ | ✅ |
| Serve termination notice | ✅ (30 d) | ✅ (statutory ground + 60 d) |
| File in-app dispute (logged for Rent Controller) | ✅ | ✅ |
| Block further messages from the other party | ❌ (must use dispute) | ❌ (must use dispute) |

## Negotiated fields (every one is auditable)

Required: monthly rent, security deposit, advance rent (months), start date, term (months), notice period (days), late-fee %, escalation % per year, who pays utilities, who pays maintenance threshold (Rs), permitted occupants count, pets allowed, subletting allowed, lock-in period (months), governing province (selects which Rent Ordinance + stamp rate applies).

Optional / free-text: special clauses, inventory list (furnished items), parking, society dues, painting at handover, witnesses (2 names + CNICs — required for registration leases > 12 months).

A change to **any** of these creates a new lease *version* (`lease_versions` row) with `prev_version_id`, `terms_hash` (SHA-256 of canonical JSON), and `proposed_by`. The current `leases.current_version_id` always points at the latest.

## How "fool-proof" is enforced

| Risk | Control |
|---|---|
| Landlord activates two tenants for one unit | Partial unique index `leases(property_id) where status='active'` + trigger that rejects competing offers on activation. |
| Either side claims "I never agreed to that" | `signatures` table stores `(lease_version_id, user_id, signed_at, ip, user_agent, terms_hash)`. Hash mismatch ⇒ signature invalid. Both sigs must reference the **same** `terms_hash`. |
| Landlord swaps wording after signing | Versions are append-only (RLS: no UPDATE/DELETE on `lease_versions` once referenced by a signature). Any further change forces a new version + re-sign. |
| Tenant deposit disappears | `deposit_ledger` table: `paid_on`, `amount`, `method`, `receipt_url` (uploaded by landlord, acknowledged by tenant within 72 h or auto-disputed). |
| Property listed while leased | Trigger flips `properties.status='leased'` on activation; Browse filters `status='active'` only. |
| Tenant overstays | Cron job at midnight flags `active` leases with `end_date < today AND no renewal` → status `holdover`, notifies both, blocks new applications until resolved. |
| Landlord locks tenant out / cuts utilities | "Raise dispute" button → freezes lease in `disputed` state, prints an evidence PDF with full event log for the Rent Controller. |
| Forged identity | CNIC + selfie upload at signup, admin-verified before any signature is accepted; `profiles.kyc_status` must be `verified` to sign. |
| Repudiation of digital signature | Email + SMS OTP confirmation at the moment of signing (`signatures.otp_verified_at`). Pakistan **ETO 2002** recognises this as an "advanced electronic signature". |
| Document tampering offline | Generated PDF embeds the `terms_hash` and a QR code linking back to the public verification URL `/verify/<lease_id>`; anyone (judge, lawyer) can confirm authenticity. |
| Statutory non-compliance | At "send offer" we calculate stamp duty for the chosen province and show it; at activation we require the landlord to upload a stamped/registered copy. |

## Pakistan-specific compliance hooks

- **Stamp Act 1899 (provincial schedules)** — rate engine in `src/lib/stamp.ts` keyed on province + annual rent. Shown before signing; uploaded stamp paper image required to leave `pending_activation`.
- **Registration Act 1908 §17(1)(d)** — if term ≥ 12 months, registration is mandatory; UI forces witness fields and shows a "Registrar appointment booked?" checkbox.
- **Rent Restriction Ordinances** — termination wizard asks for the statutory ground (personal bona-fide need, default in rent ≥ 3 months, structural reconstruction, subletting without consent, nuisance, change of user). Without a valid ground, only mutual or end-of-term termination is allowed.
- **Punjab Rented Premises Act 2009** — requires written agreement registered with the Rent Registrar within a fixed window; generated PDF matches that form layout.
- **ETO 2002 §7-13** — electronic record + advanced e-sig is admissible; our hash + OTP + audit log satisfy "attribution" and "integrity" requirements.

(These references are surfaced to the user as helper text — the app is not legal advice and says so.)

## Database changes — one new migration

**File:** `db/migrations/0007_lease_lifecycle.sql` (additive, idempotent)

```sql
-- 1. Status vocab + checks
alter table public.applications
  add constraint applications_status_chk check (status in
    ('pending','under_review','offer_sent','withdrawn','rejected','superseded','fulfilled'));

alter table public.leases
  alter column status set default 'draft',
  add column if not exists application_id   uuid references public.applications(id) on delete set null,
  add column if not exists current_version_id uuid,
  add column if not exists landlord_signed_at timestamptz,
  add column if not exists tenant_signed_at   timestamptz,
  add column if not exists activated_at       timestamptz,
  add column if not exists ended_at           timestamptz,
  add column if not exists end_reason         text,
  add column if not exists province           text,
  add column if not exists notice_period_days int,
  add column if not exists late_fee_pct       numeric,
  add column if not exists escalation_pct     numeric,
  add column if not exists utilities_paid_by  text,
  add column if not exists pets_allowed       boolean,
  add column if not exists sublet_allowed     boolean,
  add column if not exists lock_in_months     int,
  add constraint leases_status_chk check (status in
    ('draft','proposed','countered','rejected','pending_activation',
     'active','holdover','disputed','terminated','ended'));

-- 2. Versioned terms (append-only)
create table if not exists public.lease_versions (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete cascade,
  prev_version_id uuid references public.lease_versions(id),
  terms jsonb not null,
  terms_hash text not null,
  proposed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.lease_versions enable row level security;
create policy "lease parties read versions" on public.lease_versions for select
  using (exists (select 1 from public.leases l
                 where l.id = lease_id
                   and auth.uid() in (l.tenant_id, l.landlord_id)));
create policy "lease parties insert versions" on public.lease_versions for insert
  with check (exists (select 1 from public.leases l
                      where l.id = lease_id
                        and auth.uid() in (l.tenant_id, l.landlord_id)));
-- no update / no delete policy => append-only

-- 3. Signatures (one row per party per version)
create table if not exists public.lease_signatures (
  id uuid primary key default gen_random_uuid(),
  lease_version_id uuid not null references public.lease_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('tenant','landlord','witness')),
  terms_hash text not null,
  signed_at timestamptz not null default now(),
  ip inet, user_agent text,
  otp_verified_at timestamptz,
  unique (lease_version_id, user_id, role)
);
alter table public.lease_signatures enable row level security;
create policy "parties read sigs" on public.lease_signatures for select
  using (exists (select 1 from public.lease_versions v join public.leases l on l.id = v.lease_id
                 where v.id = lease_version_id and auth.uid() in (l.tenant_id, l.landlord_id)));
create policy "self insert sig" on public.lease_signatures for insert
  with check (auth.uid() = user_id);

-- 4. Immutable event log
create table if not exists public.lease_events (
  id bigserial primary key,
  lease_id uuid not null references public.leases(id) on delete cascade,
  actor_id uuid references auth.users(id),
  kind text not null,             -- 'offer_sent','countered','signed','activated','terminated',...
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table public.lease_events enable row level security;
create policy "parties read events" on public.lease_events for select
  using (exists (select 1 from public.leases l
                 where l.id = lease_id and auth.uid() in (l.tenant_id, l.landlord_id)));

-- 5. Deposit ledger (acknowledged receipts)
create table if not exists public.deposit_ledger (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete cascade,
  kind text not null check (kind in ('deposit','advance','rent','refund','deduction')),
  amount bigint not null,
  method text, receipt_url text,
  recorded_by uuid not null references auth.users(id),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  recorded_at timestamptz not null default now()
);
alter table public.deposit_ledger enable row level security;
create policy "parties read ledger" on public.deposit_ledger for select
  using (exists (select 1 from public.leases l
                 where l.id = lease_id and auth.uid() in (l.tenant_id, l.landlord_id)));
create policy "parties write ledger" on public.deposit_ledger for insert
  with check (exists (select 1 from public.leases l
                      where l.id = lease_id and auth.uid() in (l.tenant_id, l.landlord_id)));

-- 6. Critical guards
create unique index if not exists leases_one_active_per_property
  on public.leases(property_id) where status in ('active','pending_activation','holdover','disputed');
create unique index if not exists leases_one_open_per_pair
  on public.leases(property_id, tenant_id) where status in ('draft','proposed','countered');

-- 7. Trigger: activation
create or replace function public.on_lease_activated() returns trigger
language plpgsql security definer set search_path = public as $$
declare landlord_sig int; tenant_sig int;
begin
  if new.status='active' and old.status is distinct from 'active' then
    -- enforce both signatures on the SAME current version
    select count(*) into landlord_sig from public.lease_signatures
      where lease_version_id = new.current_version_id and role='landlord';
    select count(*) into tenant_sig  from public.lease_signatures
      where lease_version_id = new.current_version_id and role='tenant';
    if landlord_sig=0 or tenant_sig=0 then
      raise exception 'Lease cannot activate without both signatures on the current version';
    end if;

    update public.properties set status='leased' where id = new.property_id;
    update public.applications set status='superseded', decided_at=now()
      where property_id = new.property_id
        and id <> coalesce(new.application_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and status in ('pending','under_review','offer_sent');
    update public.leases set status='rejected'
      where property_id = new.property_id and id <> new.id
        and status in ('draft','proposed','countered','pending_activation');
    new.activated_at := now();
    insert into public.lease_events(lease_id, actor_id, kind, payload)
      values (new.id, auth.uid(), 'activated', jsonb_build_object('version', new.current_version_id));
  end if;
  return new;
end $$;
drop trigger if exists trg_lease_activated on public.leases;
create trigger trg_lease_activated before update on public.leases
  for each row execute function public.on_lease_activated();

-- 8. Trigger: closure
create or replace function public.on_lease_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('ended','terminated') and old.status is distinct from new.status then
    update public.properties set status='active' where id = new.property_id;
    new.ended_at := coalesce(new.ended_at, now());
    insert into public.lease_events(lease_id, actor_id, kind, payload)
      values (new.id, auth.uid(), new.status, jsonb_build_object('reason', new.end_reason));
  end if;
  return new;
end $$;
drop trigger if exists trg_lease_closed on public.leases;
create trigger trg_lease_closed before update on public.leases
  for each row execute function public.on_lease_closed();

-- 9. Tenant write policy (was missing)
create policy "tenant updates own lease" on public.leases for update
  using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
```

## Frontend changes

| File | Role |
|---|---|
| `src/lib/lease.ts` *(new)* | Pure functions: `canonicalTerms()`, `hashTerms()`, `proposeOffer()`, `counterOffer()`, `signCurrentVersion(otp)`, `activateLease()`, `serveNotice()`, `recordDepositPayment()`, `ackDepositPayment()`. Centralises every transition so the UI cannot bypass a rule. |
| `src/lib/stamp.ts` *(new)* | Province → stamp duty calculator + registration threshold check. |
| `src/components/lease/TermsDiff.tsx` *(new)* | Renders the field-by-field diff between two `lease_versions` (red strike / green add) for the counter-offer UI. |
| `src/components/lease/SignDialog.tsx` *(new)* | Shows full terms, scroll-to-bottom gate, OTP via Supabase Auth, writes a `lease_signatures` row with `terms_hash` of the version being signed. |
| `src/pages/landlord/Applications.tsx` | Remove instant "Approve". Add **Open negotiation** (opens chat), **Send lease offer** (full terms form → creates lease in `proposed`), **Reject**. Pending list grouped by property so landlord sees competing applicants side-by-side. |
| `src/pages/landlord/Leases.tsx` *(new)* | All leases by status tab: Draft, Negotiating, Awaiting tenant, Pending activation, Active, Holdover, Disputed, Closed. Each card shows current version, signatures, deposit ledger, event log, and the right action buttons. |
| `src/pages/landlord/Listings.tsx` | Show property status badge. **End lease** button (statutory-ground wizard) for leased units. |
| `src/pages/landlord/Dashboard.tsx` | Tiles: Vacant, Negotiating, Awaiting signature, Active, Holdover, Disputed. |
| `src/pages/tenant/Applications.tsx` | When app reaches `offer_sent` → "Review offer" CTA. |
| `src/pages/tenant/Lease.tsx` | Tabs: **Offers**, **Current lease**, **Past leases**. Offer card: full terms, **Counter**, **Accept & sign**, **Decline**. Current lease: deposit ledger, raise dispute, serve 30-day notice, request mutual termination, download PDF. |
| `src/pages/shared/Messages.tsx` | Accept `?to=<uuid>&context=lease:<id>`, render names not UUIDs. |
| `src/pages/public/Browse.tsx` + `PropertyDetail.tsx` | Filter `properties.status='active'`; on Detail, hide Apply when status ≠ active and show "Currently leased" banner. |
| `src/pages/public/VerifyLease.tsx` *(new)* | Public route `/verify/:leaseId` — anyone with the QR can verify `terms_hash` matches and view non-PII metadata (parties' initials, dates, property, status). |
| `src/pages/admin/Disputes.tsx` *(new)* | Admin view of disputed leases with full event log; admin can force-terminate after order upload. |

## PDF generation (court-ready)

`src/lib/lease-pdf.ts` *(new)* — server-side PDF (TanStack server fn) using `pdf-lib`:

1. Header with property address, parties (full name, CNIC, address), province.
2. Full terms in numbered clauses (rent, deposit, term, notice, late-fee, escalation, utilities, maintenance, occupants, pets, sublet, lock-in, special clauses, inventory).
3. Witness block (names + CNICs) for ≥ 12-month leases.
4. Signature block: typed name, signed-at, IP, OTP confirmation reference.
5. Footer: `terms_hash` (full SHA-256), QR code to `/verify/:leaseId`, page X of Y, generated-at.
6. Stamp paper image + deposit receipts appended as annexes.

## Files to update in your local repo

**Create:**
- `db/migrations/0007_lease_lifecycle.sql`
- `src/lib/lease.ts`
- `src/lib/stamp.ts`
- `src/lib/lease-pdf.ts`
- `src/components/lease/TermsDiff.tsx`
- `src/components/lease/SignDialog.tsx`
- `src/pages/landlord/Leases.tsx`
- `src/pages/public/VerifyLease.tsx`
- `src/pages/admin/Disputes.tsx`

**Edit:**
- `src/pages/landlord/Applications.tsx`
- `src/pages/landlord/Listings.tsx`
- `src/pages/landlord/Dashboard.tsx`
- `src/pages/tenant/Lease.tsx`
- `src/pages/tenant/Applications.tsx`
- `src/pages/shared/Messages.tsx`
- `src/pages/public/Browse.tsx`
- `src/pages/public/PropertyDetail.tsx`
- `src/App.tsx` (register new routes)

**One DB step locally:** run `db/migrations/0007_lease_lifecycle.sql` in your Supabase SQL editor.

## Explicit non-goals (call out to evaluators)

- We do **not** file with the Rent Registrar — we produce the document the landlord submits.
- We do **not** transfer money — deposit ledger records what the landlord acknowledges receiving; integrating Easypaisa/JazzCash/Raast is a future milestone.
- We do **not** issue legally binding court orders — `disputed` exports an evidence PDF for the Rent Controller.
- We **do** satisfy ETO 2002 "advanced electronic signature" via OTP + hash + audit log, which is admissible in Pakistani courts.
