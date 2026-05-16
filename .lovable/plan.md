# Fix: lease stuck in "Sent offers" after both parties effectively agreed

## Root cause

The screenshot shows `You signed: — · Tenant signed: ✓` with status `Proposed`. The landlord sent the offer, the tenant signed it, but the landlord has no way to sign:

- `src/pages/landlord/Leases.tsx` (OfferCard, line 202):
  `{!proposedByMe && !landlordSigned && <Button>Accept & sign</Button>}`
  Because the landlord proposed it, `proposedByMe` is true → button hidden.
- `signCurrentVersion` only flips status when BOTH `landlord` and `tenant` signatures exist for the current version. The proposer's signature is never written anywhere, so the lease never activates (or even reaches `pending_activation`).

Same bug on the tenant side when a tenant counters and the landlord then signs.

## Fix (pick one — recommended: Option A)

### Option A — Proposer signs automatically on send (recommended)
The act of sending/countering an offer is the proposer's signature on that version (this is how DocuSign-style "send" flows work, and it matches the UI copy "Once both parties sign the current version, the lease activates automatically").

- `src/lib/lease.ts`
  - In `sendInitialOffer`: after inserting the version, also insert a `lease_signatures` row for the landlord on that version and stamp `leases.landlord_signed_at`.
  - In `counterOffer`: after inserting the new version, insert a `lease_signatures` row for `proposedBy` (role inferred from whether `proposedBy === lease.landlord_id`) and stamp the matching `*_signed_at`.
  - No change needed to `signCurrentVersion` — it already activates / moves to `pending_activation` once both signatures exist.

- `src/pages/landlord/Leases.tsx` (OfferCard)
  - Remove `!proposedByMe` from the sign-button condition so it reads `{!landlordSigned && <Button>Accept & sign</Button>}`. This is a safety net in case any historical lease is missing the proposer signature.
  - Update the "Waiting for tenant…" hint to also cover the case where landlord has signed but tenant hasn't.

- `src/pages/tenant/Lease.tsx` (mirror fix)
  - Same: drop the `!proposedByMe` gate on the tenant-side sign button so a tenant who countered can still confirm if needed.

### Option B — Keep "send ≠ sign", just expose the button
Only change the UI: drop `!proposedByMe` from the sign condition on both sides. Landlord/tenant must explicitly click "Sign" even on offers they sent. Safer audit trail, one extra click.

## Existing/seeded leases
For the lease shown in the screenshot (and any others stuck the same way):
- Option A: a one-off backfill insert into `lease_signatures` for the proposer of each `current_version_id` where the row is missing, then re-run the activation logic. Can be done with a tiny SQL block in the same migration file.
- Option B: the landlord just clicks the now-visible "Accept & sign" button — no backfill needed.

## Out of scope
- No changes to deposit-gated activation (`pending_activation` → `active` via deposit payment trigger) — that part is correct and unrelated.
- No changes to documents flow.

## Decision needed
Which option do you want?
1. **A — auto-sign on send** (one click for the other party, lease activates immediately on their signature; matches current UI copy).
2. **B — show the missing button only** (both parties must explicitly click Sign on every version, including ones they sent).
