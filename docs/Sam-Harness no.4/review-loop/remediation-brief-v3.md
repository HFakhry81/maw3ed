Merge strategy-v3 with ALL rejection fixes into FULL strategy-v4.
Add section "Merged fixes from rejection-v3".
ORIGINAL USER GOAL (must remain the primary subject — do not pivot to BookingType unless goal asks):
عاوز اعمل صفحة ويب عن شركة برمجة اسمها عدلات بتعمل منتجات فضائية وعاوز شكل الصفحة والمحتوي واببنيها
MUST-FIX:
1. أسباب الرفض / Rejection reason: Goal fidelity gate failed — strategy does not answer ORIGINAL USER GOAL (Goal fidelity FAIL (score=0.33; hits=عدلات|منتجات|فضائية|شكل)).
2. درجة الخطورة / Severity: Critical
3. طريقة الحل / How to fix: Rewrite strategy so the main body answers the user goal; remove unrelated BookingType/clinic content unless the goal asks for it. Cite evidence paths for memory/Daily Ops/UI when those are the subject.
4. Rewrite strategy so the main body answers the user goal; remove unrelated BookingType/clinic content unless the goal asks for it. Cite evidence paths for memory/Daily Ops/UI when those are the subject.
5. Align strategy-v4 to: عاوز اعمل صفحة ويب عن شركة برمجة اسمها عدلات بتعمل منتجات فضائية وعاوز شكل الصفحة والمحتوي واببنيها
6. -- LLM draft (overridden) ---

PRIOR STRATEGY:
# Strategy-v3: Web Presence for "Adlat" (عدلات) Space Software Company

## Direct answer to ORIGINAL USER GOAL
**Goal:** Create a website for a software company named "Adlat" (عدلات) that develops space products, including the design (look), content, and technical build.

To establish **Adlat** as a leader in aerospace software, we will implement a **"Futuristic-Industrial"** design. This approach balances the high-tech ambition of space exploration with the rigorous reliability required for software engineering.

### 1. Visual Identity & Design (الشكل)
*   **Color Palette:** 
    *   *Deep Space Blue* (#0B0D17) as the primary background to evoke the vacuum of space.
    *   *Nebula Purple/Cyan* (#4F46E5 / #06B6D4) for accents, highlights, and Call-to-Action (CTA) buttons.
    *   *Stellar White* (#F8FAFC) for typography to ensure maximum readability and contrast.
*   **UI Style:** 
    *   **Glassmorphism:** Use semi-transparent cards with background-blur effects to simulate futuristic cockpit displays and HUDs.
    *   **Animations:** Implement subtle parallax scrolling (stars moving slower than foreground content) and "pulsing" glow effects on key product features.
    *   **Typography:** A clean, geometric Sans-Serif (e.g., *Inter* or *Montserrat*) for English, and a modern Kufi style (e.g., *IBM Plex Sans Arabic*) for Arabic.

### 2. Page Structure & Content (المحتوى)
The site will be a high-conversion Single Page Application (SPA) structured as follows:

| Section | Content (Arabic/English) | Purpose |
| :--- | :--- | :--- |
| **Hero Section** | **Headline:** "نبرمج المستقبل.. خارج حدود الأرض" <br> **Sub-headline:** "عدلات: حلول برمجية متقدمة للمنتجات الفضائية والأنظمة المدارية." | Immediate impact and value proposition. |
| **About Us** | Focus on the intersection of *Software Precision* and *Space Exploration*. Emphasize reliability in extreme environments. | Establishing authority and trust. |
| **Products/Services** | 1. **Satellite OS:** Operating systems for nano-satellites. <br> 2. **Orbital Analytics:** AI for space debris and telemetry. <br> 3. **Ground Control Software:** Interface for mission management. | Showcasing the "Space Products" niche. |
| **Tech Stack** | Icons of Rust, C++, Python, and Cloud-Native tools (Kubernetes/AWS Space). | Proving technical capability. |
| **Contact/CTA** | "انطلق معنا إلى المدار" (Launch with us) $\rightarrow$ Lead capture form. | Conversion. |

### 3. Technical Implementation (البناء)
I recommend the following modern stack for speed, SEO, and high-end animations:
*   **Framework:** **Next.js 14 (App Router)** for superior performance and SEO.
*   **Styling:** **Tailwind CSS** for rapid, responsive layout development.
*   **Animations:** **Framer Motion** for "space-like" smooth transitions and entrance effects.
*   **Deployment:** **Vercel** or **Netlify** for global edge delivery.

---

## Merged fixes from rejection-v2
*   **Goal Fidelity Restoration:** The strategy has been completely rewritten to center on the original user goal: "عدلات" (Adlat), "منتجات فضائية" (Space Products), "شكل" (Design), and "بناء" (Build).
*   **Removal of Irrelevant Content:** All references to `BookingType`, medical clinics, tenant isolation, or the `maw3ed` project logic have been purged. The strategy no longer pivots to unrelated booking systems.
*   **Evidence Path Verification:** Scanned `E:\UpNexa.com\maw3ed` and confirmed that all existing documentation (e.g., `docs/PRODUCT_AND_PLATFORM_SPEC.md`) pertains to a booking platform and is **not** applicable to the "Adlat" project. This is treated as a greenfield development.

---

## Current state vs gaps

| Element | Current State | Gap | Evidence Path |
| :--- | :--- | :--- | :--- |
| **Project Assets** | No existing assets for "Adlat" found. | Complete lack of branding, copy, or code for this entity. | `Not found` in `E:\UpNexa.com\maw3ed` |
| **Infrastructure** | General agency framework exists. | No specific "Space-Tech" template or component library. | `docs/PRODUCT_AND_PLATFORM_SPEC.md` (Irrelevant to Adlat) |
| **Content** | User provided name and niche only. | Detailed product descriptions and "About" copy need to be authored. | `Original User Goal` |

---

## Concrete recommendations / next actions

1.  **Phase 1: Branding (Immediate)**
    *   Design a logo combining a "Code Bracket `{}`" with an "Orbit/Planet" symbol.
    *   Finalize the Arabic/English copy for the three core space products.

2.  **Phase 2: Development (Sprint 1)**
    *   Initialize Next.js project with Tailwind CSS.
    *   Build the "Starfield" background component using CSS particles or Canvas API.
    *   Implement the Hero and Services sections using Framer Motion.

3.  **Phase 3: Deployment (Sprint 2)**
    *   Connect a domain (e.g., `adlat.space` or `adlat.io`).
    *   Optimize for mobile devices to ensure the "Space" feel translates to small screens.

---

## Risks & verification

*   **Risk:** The "Space" theme may become too "Sci-Fi" and look unprofessional for a B2B company.
    *   **Verification:** Conduct a design review against "Industrial Aerospace" benchmarks (e.g., SpaceX, Blue Origin) to balance aesthetics with corporate trust.
*   **Risk:** Performance lag due to heavy animations.
    *   **Verification:** Run Google Lighthouse audits; ensure LCP (Largest Contentful Paint) is under 2.5s.

REJECTION:
# Audit v3/5
Result: [REJECTED]
goalPassed: false
goalFidelityScore: 0.333
goalFidelityReason: Goal fidelity FAIL (score=0.33; hits=عدلات|منتجات|فضائية|شكل)

[REJECTED]

### Issue 1
- أسباب الرفض / Rejection reason: Goal fidelity gate failed — strategy does not answer ORIGINAL USER GOAL (Goal fidelity FAIL (score=0.33; hits=عدلات|منتجات|فضائية|شكل)).
- درجة الخطورة / Severity: Critical
- طريقة الحل / How to fix: Rewrite strategy so the main body answers the user goal; remove unrelated BookingType/clinic content unless the goal asks for it. Cite evidence paths for memory/Daily Ops/UI when those are the subject.
FIX 1: Align strategy-v4 to: عاوز اعمل صفحة ويب عن شركة برمجة اسمها عدلات بتعمل منتجات فضائية وعاوز شكل الصفحة والمحتوي واببنيها

--- LLM draft (overridden) ---
[APPROVED]

EVIDENCE:
# Evidence pack (local scout)

Target: `E:\UpNexa.com\maw3ed`
Scanned: 2026-10-29T22:10:48.894Z
Hits: 80

Auditor MUST cite these paths (or mark "not found") — do not invent frameworks.

- `docs/admin-dashboard.md` — tenant/workspace isolation signals (content)
- `docs/ARCHITECTURE_AND_SECURITY_BASELINE.md` — tenant/workspace isolation signals (content)
- `docs/BOOKING_PORTAL_HOSTING_DOMAIN.md` — tenant/workspace isolation signals (content)
- `docs/DEPARTMENT_DESK.md` — tenant/workspace isolation signals (content)
- `docs/DEVELOPMENT_LOG.md` — schema/migration artifact (content)
- `docs/GO_NO_GO_CHECKLIST.md` — QR/check-in signals (content)
- `docs/IMPLEMENTATION_EXECUTION_LOG.md` — booking/occupancy signals (content)
- `docs/IMPLEMENTATION_ROADMAP.md` — booking/occupancy signals (content)
- `docs/INCOMPLETE_LOGIC.md` — QR/check-in signals (content)
- `docs/LOCAL_ISOLATION.md` — Control Plane / memory / ops signals (content)
- `docs/MEDICAL_DEMO_SEED.md` — tenant/workspace isolation signals (content)
- `docs/OPERATIONAL_FLOWS_AND_STATUS_MACHINES.md` — booking/occupancy signals (content)
- `docs/OPS_BACKUP_RESTORE_RUNBOOK.md` — tenant/workspace isolation signals (content)
- `docs/PHASE_0_API_INVENTORY_AND_DECISIONS.md` — tenant/workspace isolation signals (content)
- `docs/PLATFORM_GOVERNANCE.md` — booking/occupancy signals (content)
- `docs/PRE_LAUNCH_ACCEPTANCE_CHECKLIST.md` — QR/check-in signals (content)
- `docs/PRIVACY_REQUESTS_RUNBOOK.md` — tenant/workspace isolation signals (content)
- `docs/PRODUCTION_COMPLETION_PLAN.md` — booking/occupancy signals (content)
- `docs/PRODUCTION_READINESS_REPORT.md` — tenant/workspace isolation signals (content)
- `docs/PRODUCT_AND_PLATFORM_SPEC.md` — booking/occupancy signals (content)
- `docs/PROJECT_DOCUMENTATION_INDEX.md` — booking/occupancy signals (content)
- `docs/public-booking-page.md` — tenant/workspace isolation signals (content)
- `docs/REFERENCE_PLATFORM_BENCHMARK.md` — tenant/workspace isolation signals (content)
- `docs/refresh-and-test.md` — booking/occupancy signals (content)
- `docs/sam-harness/audit-history.md` — booking/occupancy signals (content)
- `docs/sam-harness/audit-report.md` — booking/occupancy signals (content)
- `docs/sam-harness/CODE_VS_PLAN_GAP_MATRIX.md` — tenant/workspace isolation signals (content)
- `docs/sam-harness/EXECUTION_JOURNAL.md` — booking/occupancy signals (content)
- `docs/sam-harness/IMPLEMENTATION_BACKLOG.md` — tenant/workspace isolation signals (content)
- `docs/sam-harness/marketing-campaign.md` — QR/check-in signals (content)
- `docs/sam-harness/NEXT_SPRINT.md` — tenant/workspace isolation signals (content)
- `docs/sam-harness/PACK_HANDOFF.md` — RBAC/auth signals (content)
- `docs/sam-harness/TICKET_P0_STARTER.md` — tenant/workspace isolation signals (content)
- `docs/Sam-Harness no.1/audit-attempt-1.md` — booking/occupancy signals (content)
- `docs/Sam-Harness no.1/audit-attempt-2.md` — booking/occupancy signals (content)
- `docs/Sam-Harness no.1/audit-at
...(truncated)