# Landing page: trust-first cleanup

## Remove
- The 4-tile **stats strip** (Active listings / Cities covered / Verified landlords / Avg. reply time). The "< 2 hr" reply time and "Verified landlords" counts are unverifiable claims — pulled out entirely.
- Stop fetching `landlords` count in the `useEffect` (no longer used).

## Replace with a trust band
A quieter, honest section in the same slot — three points, no numbers:
1. **Documents, not guesswork** — Tenants share CNIC and income proof in-app. Landlords approve only what they've actually seen.
2. **Lease & payments in one place** — Sign, track rent, and log maintenance from the same dashboard you applied in.
3. **Real listings, real people** — Every property is posted by the actual landlord; messaging is direct, no middlemen.

Plain card layout, muted background, small lucide icons (`FileCheck`, `Receipt`, `MessageSquare`). No badges, no gradients, no big numbers.

## Tone pass on the rest
- Hero badge **"Pakistan's modern rental platform"** → **"Built for renters and landlords in Pakistan"** (less marketing-y).
- CTA card heading stays factual; remove the "Own a property in one of the big five?" phrasing → **"List your property in minutes"** with subtext **"Free to list. You stay in control of every application and lease."**
- Keep: hero, city chips, Explore by city tiles (real counts), How it works, Just added, CTA. Drop the `Sparkles` badge icon.

## Out of scope
- Testimonials (we have none — adding fake ones would be the exact thing you're avoiding).
- Press logos / partner badges.

## Acceptance
1. Stats strip is gone.
2. New trust band shows the three honest points instead.
3. No fabricated numbers, "verified" claims, or response-time promises anywhere on the page.
4. Visual tone is calmer — fewer gradients/blurs, more whitespace.