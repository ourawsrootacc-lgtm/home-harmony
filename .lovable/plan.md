# Plan: HomeRentals Final Defense Presentation (.pptx)

I will produce a single downloadable file — **`HomeRentals_Final_Defense.pptx`** — designed to wow evaluators while staying simple enough for a non-technical audience to follow. Built with `pptxgenjs` at 1920×1080, exported, then visually QA'd page-by-page (converted to PDF → JPGs) before delivery.

## Design direction

- **Palette:** Midnight Executive — deep navy `#1E2761` dominant, ice-blue `#CADCFC` supporting, warm gold `#F5B700` accent. Premium, trustworthy, real-estate appropriate.
- **Typography:** Georgia (headers) + Calibri (body). Title slides 88–104pt, section headers 40–54pt, body 28–32pt, captions 20–22pt — all projection-legible.
- **Motif:** Gold left-edge accent bar on content slides + small gold icon-in-circle next to each section header. Dark "sandwich" intro/closing, light content slides in between.
- **Density rule:** One idea per slide. Max 4 bullets, max 3 cards per row. Plain-English first, jargon in a small caption underneath.

## Slide outline (~28 slides, mapped to the rubric)

**Opening (3)**
1. Title — Project name, tagline ("Pakistan's end-to-end rental lifecycle platform"), student/supervisor/session placeholders
2. Agenda — visual roadmap of the 7 rubric sections
3. The Problem in 30 seconds — Zameen shows ads, WhatsApp handles the rest → chaos, lost receipts, disputes

**Introduction (3)**
4. What HomeRentals is — one-line pitch + 4 icon pillars (Browse, Apply, Lease, Pay)
5. Who it's for — Tenants, Landlords, Maintenance, Admin (4 persona cards)
6. Objectives & Scope (in / out) — clear "we did this, we deliberately didn't do that"

**Literature Review / Similar Systems (2)**
7. Comparison table — HomeRentals vs Zameen, Graana, Airbnb, Kunjee (rows: listings, applications, leases, payments, maintenance, RLS security)
8. The gap we fill — visual Venn-style "classifieds + short-stay + property-mgmt = us"

**Examiner feedback addressed (1)**
9. Progress-presentation comments & fixes — left column: comment, right column: how we resolved it (placeholders you can edit)

**Design — Interface / Screens (4)**
10. System architecture — SPA ↔ Supabase ↔ Mapbox diagram, explained in 3 plain sentences
11. Database ERD (simplified) — 8 core tables with relationship lines
12. Key user flow — Tenant Apply → Landlord Approve → Lease → Pay (sequence-style)
13. UI tour — 4 real screenshots placeholder grid (Browse, Property Detail, Landlord Dashboard, Payments)

**Design — Code (3)**
14. Folder structure — annotated tree of `src/` so a layperson sees order
15. Security highlight — Row-Level Security explained as "an invisible guard at the database door" + 6-line `has_role()` snippet
16. Lease state machine — proposed → countered → active → ended, as a colored flow

**Testing (3)**
17. Techniques used — Manual UAT, RLS policy tests, Zod validation, cross-browser (4 icon cards)
18. Test results — table: 40 functional cases, 12 RLS cases, pass rate, key bugs caught
19. Short demo video placeholder slide — 16:9 black frame with "▶ Live demo" + QR-code placeholder linking to a hosted clip you'll record

**Deployment (2)**
20. How it's hosted — Vercel (frontend) + Supabase (backend) diagram, "deploy in 2 minutes, zero servers to babysit"
21. Future extensions — Stripe/JazzCash live payments, mobile app, AI matching, Urdu i18n

**Defense ammunition (3)** *(short slides aimed at the "silly questions")*
22. Why no admin dashboard? — depth-over-breadth decision, 3 bullets
23. Why manual payment proof? — regulatory + PCI-DSS + market reality (3 cards)
24. Why not just use Zameen? — classifieds stop at "call the owner"; we handle the next 12 months

**Closing (4)**
25. Final product — what's ready today (checklist of working modules)
26. Lessons learned — 3 short bullets
27. References — IEEE-style mini list (React, Supabase, OWASP, RLS paper, etc.)
28. Thank You / Q&A — bold full-bleed close with contact placeholder

## Technical execution

1. Write `/tmp/deck/build.js` using `pptxgenjs` (1920×1080, embedded base64 images for any icons/diagrams).
2. Render the architecture, ERD, lease state, and flow diagrams via Mermaid CLI → PNG → embed as base64 (paths break LibreOffice PDF conversion).
3. Export to `/mnt/documents/HomeRentals_Final_Defense.pptx`.
4. **Mandatory QA:** `soffice --convert-to pdf` → `pdftoppm` → inspect every slide JPG. Fix overflow, contrast, alignment, leftover placeholder text. Re-render until a full clean pass.
5. Deliver via `<presentation-artifact>` tag.

## What this is NOT

- Not 60+ slides of filler — 28 focused slides, ~12 minute talk.
- Not auto-recorded video; slide 19 is a placeholder frame where you drop your own screen-record link/QR.
- Not pre-filled with your name — `[Student Name]`, `[Reg #]`, `[Supervisor]`, `[Session]` left as clear placeholders.

**One quick question before I build:** do you want me to use the same student/supervisor/session placeholders as the thesis, or do you have the actual names now? Reply with the details or just "use placeholders" and I'll start.
