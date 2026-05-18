# Plan: HomeRentals FYP Thesis (~100 pages)

I will produce a single, defense-ready Microsoft Word document — `HomeRentals_FYP_Thesis.docx` — that follows the CECOS Software Engineering FYP format from your uploaded sample exactly (Times New Roman 12 for front matter, Calibri 12 / 1.5 line spacing for body, Calibri Bold headings, justified paragraphs, page numbers, footer "Department of SE, CECOS University of IT & Emerging Sciences, Pakistan", running header with project title).

The content will be grounded entirely in the actual HomeRentals codebase (React + Vite + Supabase + Mapbox), the 17 migrations, RLS policies, lease lifecycle, manual payments module, maintenance workflow, and admin tools — so every claim is defensible in the viva.

## Structure (mirrors the CECOS template exactly)

**Front matter (~10 pages)**
- Binding page, Inside title page, Abstract (1 page), Undertaking, Acknowledgements, Dedication, Table of Contents, List of Figures, List of Tables, List of Abbreviations

**Chapter 1 — Introduction (~8 pages)**
1.1 Introduction · 1.2 Existing System · 1.3 Problem Statement · 1.4 Project Objectives · 1.5 Project Scope · 1.6 Gap Analysis · 1.7 Proposed Solution · 1.8 Project Plan (Gantt) · 1.9 Report Outline · 1.10 Empathy Map

**Chapter 2 — Software Requirement Specifications (~16 pages)**
Full IEEE-style SRS: purpose, document conventions, intended audience, product perspective, user classes (tenant/landlord/maintenance/admin), operating environment, design/implementation constraints, assumptions, external interfaces (UI/HW/SW/Comms), 10+ system features each with REQ-IDs, performance/safety/security/quality requirements.

**Chapter 3 — Use Case Analysis (~10 pages)**
Actor catalogue, use case diagram (per role), 12+ fully expanded use case descriptions (preconditions, main flow, alternate, postconditions) covering signup, browse, apply, approve lease, lifecycle countering, payment submit/approve/dispute, maintenance ticket, admin moderation.

**Chapter 4 — System Design (~18 pages)**
4.1 Overview · 4.2 Design Approach · 4.3 Architecture Diagram (SPA + Supabase BaaS) · 4.4 ER Diagram (full, from your migrations) · 4.5 Class Diagram · 4.6 Sequence Diagrams (login, apply→lease, payment approval, maintenance) · 4.7 Operation Contracts · 4.8 Activity Diagrams · 4.9 State Diagrams (lease + ticket + payment) · 4.10 Component Diagram · 4.11 Deployment Diagram · 4.12 DFD Level 0 & 1

**Chapter 5 — Implementation (~14 pages)**
Tools/stack, folder structure, key code excerpts (AuthProvider, RLS `has_role()`, lease lifecycle SQL, payment submit, Browse filter fix, Mapbox fallback), data validation (Zod, CNIC/phone regex), version control (Git), CI, deployment to Vercel/Netlify.

**Chapter 6 — Testing and Evaluation (~10 pages)**
Strategy, test plan, test cases table (40+), unit tests, integration tests, RLS policy tests, performance, stress, UAT with screenshots.

**Chapter 7 — Summary, Conclusion, Future Enhancements (~5 pages)**
Project summary, objectives achieved, lessons learned, limitations, future work (Stripe live, mobile app, AI matching, i18n Urdu).

**Appendices (~10 pages)** — A: User Manual · B: Administrator Manual · C: Promotional Material · D: Full ER schema · E: Glossary

**References & Bibliography** — 25+ IEEE-format citations (React, Vite, Supabase, PostgreSQL, RLS papers, Mapbox, OWASP, IEEE 830 SRS, PMBOK, etc.)

## Diagrams included (all rendered as images embedded in the .docx)

| # | Diagram | Tool |
|---|---|---|
| 1 | System Architecture (SPA ↔ Supabase ↔ Mapbox) | Mermaid → PNG |
| 2 | ER Diagram (full schema) | Mermaid → PNG |
| 3 | Use Case Diagram (4 actors) | PlantUML/Mermaid → PNG |
| 4 | Class Diagram | Mermaid → PNG |
| 5 | Sequence: Tenant Apply → Lease | Mermaid → PNG |
| 6 | Sequence: Payment Submit → Approve | Mermaid → PNG |
| 7 | Activity: Maintenance Ticket | Mermaid → PNG |
| 8 | State Machine: Lease lifecycle | Mermaid → PNG |
| 9 | State Machine: Ticket status | Mermaid → PNG |
| 10 | State Machine: Payment status | Mermaid → PNG |
| 11 | Component Diagram | Mermaid → PNG |
| 12 | Deployment Diagram | Mermaid → PNG |
| 13 | DFD Level 0 | Mermaid → PNG |
| 14 | DFD Level 1 | Mermaid → PNG |
| 15 | Gantt project plan | Mermaid → PNG |
| 16 | Empathy Map | Generated PNG |

## Technical execution

1. Render all 16 diagrams to PNG using `mmdc` (mermaid-cli) into `/tmp/figures/`.
2. Build the .docx with `docx` (JavaScript) per the docx skill — explicit US Letter page size, Calibri body, Times New Roman front matter, semantic heading styles (Heading1/2/3 overrides), Table of Contents field, List of Figures, List of Tables, header & footer with page numbers, embedded images with captions, properly formatted requirement tables and use-case tables.
3. Validate the .docx (`validate_document.py`).
4. QA: convert to PDF (LibreOffice) and inspect every page as JPG to catch overflow, clipped images, broken tables, missing captions. Fix and re-render until clean.
5. Deliver as `<presentation-artifact>` so you can download and open it.

## What this plan is NOT

- Not changing any project source code.
- Not 100 pages of filler — each page is grounded in real artifacts from your repo (migrations, components, RLS policies). Final length will land in the 90–110 page range depending on diagram sizes and Word's pagination.
- Not a substitute for your name/registration numbers/supervisor — placeholders will be clearly marked `[Your Name]`, `[Reg #]`, `[Supervisor]`, `[Session]` for you to fill in.

If you approve, I will execute end-to-end in one pass and hand back the downloadable file plus a short Q&A guide.

**Before I start, one quick question if you want to answer (otherwise I'll use placeholders):** student name(s) + registration number(s), supervisor name, and session (e.g., 2024-2025)? You can also just say "use placeholders" and fill them in yourself in Word.
