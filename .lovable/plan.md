# Cities, marlas, and landing cleanup

## 1. Limit to 5 cities + societies

**`src/lib/constants.ts`**
- Replace `PK_CITIES` with **only** the 5 supported cities: Karachi, Lahore, Islamabad, Peshawar, Quetta. Rawalpindi, Faisalabad, Multan, Hyderabad, Gujranwala, Sialkot are removed everywhere.
- Add `PK_SOCIETIES: Record<City, string[]>`:
  - Karachi: DHA, Clifton, Gulshan-e-Iqbal, Bahria Town Karachi, Gulberg Town, Malir, North Nazimabad, PECHS, Scheme 33
  - Lahore: DHA, Bahria Town, Gulberg, Model Town, Johar Town, Wapda Town, Askari, Cantt, Valencia
  - Islamabad: F-6, F-7, F-8, F-10, F-11, G-9, G-10, G-11, G-13, E-11, Bahria Town, DHA
  - Peshawar: Hayatabad, University Town, DHA Peshawar, Regi Model Town, Cantt
  - Quetta: Cantt, Jinnah Town, Satellite Town, Chaman Housing, Samungli Road
- Each list ends with `"Other"` so unusual societies aren't blocked.

**Schema — `supabase/pending_migrations/<ts>_property_society_and_marlas.sql`**
- `alter table public.properties add column society text;`
- Replace any old `city` check with one restricting to the 5 cities.

**Forms / pages**
- `src/pages/landlord/ListingForm.tsx`: City `Select` uses the 5 cities; add a dependent **Society** `Select` (options from `PK_SOCIETIES[city]`, "Other" → free-text input). Persist `society`.
- `src/pages/public/Browse.tsx`: city filter limited to the 5; show Society filter once a city is selected.
- `src/pages/public/Landing.tsx`: city chips render exactly the 5 cities (no `.slice`).
- `src/lib/validators.ts` → `propertySchema`: `city: z.enum([...5 cities])`, `society: z.string().max(80).optional()`.

**Display**
- `PropertyCard.tsx` and `PropertyDetail.tsx` show `society, city` when society present.

## 2. Replace "sq ft" with "Marlas"

1 Marla ≈ 272.25 sq ft. `area_marlas` becomes the source of truth.

**Schema — same migration**
- `alter table public.properties add column area_marlas numeric(6,2);`
- Backfill: `update public.properties set area_marlas = round((area_sqft / 272.25)::numeric, 2);`
- Keep `area_sqft` column for now (computed from marlas via trigger) to avoid breaking consumers; remove in a follow-up.

**Frontend**
- `src/lib/validators.ts`: replace `area_sqft` with `area_marlas: z.coerce.number().min(0.5).max(2000)`.
- `ListingForm.tsx`: input label "Area (Marlas)", step `0.5`. Drop the sq ft field.
- All read sites (`PropertyCard`, `PropertyDetail`, `Browse`, `Favorites`): display `{area_marlas} Marla`.
- Remove sq ft filters from Browse if present.

## 3. Landing page cleanup + richer content

**`src/pages/public/Landing.tsx`**
- Hero subheading copy → **"Browse rentals across five major cities of Pakistan — all in one place."** (removes the "Karachi, Lahore, Islamabad and beyond" text in screenshot 2).
- City chips under hero render exactly the 5 cities (replaces the 7-city row in screenshot 1).
- **Remove** the 3-card section (Verified listings / End-to-end management / Built-in maintenance).
- Add new sections below the hero:
  1. **Live stats strip** — Properties listed, Cities covered (5), Active landlords, Avg. response time. Counts pulled from Supabase where possible.
  2. **Featured cities** — 5 city tiles with gradient backgrounds and a live `select count(*) from properties where city = ? and status = 'active'` badge; each links to `/browse?city=...`.
  3. **How it works** — 3 numbered steps with a toggle: tenant view (*Search → Apply → Move in*) / landlord view (*List → Approve → Get paid*).
  4. **Recently added** — last 4 active listings as `PropertyCard`s, horizontally scrollable on mobile.
- All styling uses semantic tokens from `src/styles.css`; no hard-coded hex.

## Out of scope
- Dropping `area_sqft` column entirely (follow-up migration).
- Society autocomplete / geocoding.

## Acceptance
1. Only the 5 cities appear anywhere in signup, listing form, browse filter, and the landing chips.
2. Listing form requires city + society; society options change with city; "Other" allows free text.
3. Listing form shows Area in Marlas (no sq ft); existing listings show converted Marlas correctly.
4. Hero subheading reads the new sentence; the 3 feature cards are gone, replaced by stats, city tiles, how-it-works, and recent listings.
5. No DB regressions: backfill populates `area_marlas`; `society` is nullable.