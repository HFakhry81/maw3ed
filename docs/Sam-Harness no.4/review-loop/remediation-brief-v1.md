Merge strategy-v1 with ALL rejection fixes into FULL strategy-v2.
Add section "Merged fixes from rejection-v1".
ORIGINAL USER GOAL (must remain the primary subject — do not pivot to BookingType unless goal asks):
عاوز اعمل صفحة ويب عن شركة برمجة اسمها عدلات بتعمل منتجات فضائية وعاوز شكل الصفحة والمحتوي واببنيها
MUST-FIX:
1. أسباب الرفض / Rejection reason: Goal fidelity gate failed — strategy does not answer ORIGINAL USER GOAL (Goal fidelity FAIL (score=0.33; hits=عدلات|منتجات|فضائية|شكل)).
2. درجة الخطورة / Severity: Critical
3. طريقة الحل / How to fix: Rewrite strategy so the main body answers the user goal; remove unrelated BookingType/clinic content unless the goal asks for it. Cite evidence paths for memory/Daily Ops/UI when those are the subject.
4. Rewrite strategy so the main body answers the user goal; remove unrelated BookingType/clinic content unless the goal asks for it. Cite evidence paths for memory/Daily Ops/UI when those are the subject.
5. Align strategy-v2 to: عاوز اعمل صفحة ويب عن شركة برمجة اسمها عدلات بتعمل منتجات فضائية وعاوز شكل الصفحة والمحتوي واببنيها
6. -- LLM draft (overridden) ---

PRIOR STRATEGY:
## Direct answer to ORIGINAL USER GOAL

To build a professional web presence for **"Adlat" (عدلات)**, a software company specializing in space products, we will implement a "Futuristic-Industrial" design. The goal is to balance the reliability of software engineering with the ambition of aerospace.

### 1. Visual Identity & Design (الشكل)
*   **Color Palette:** 
    *   *Deep Space Blue* (#0B0D17) as the primary background.
    *   *Nebula Purple/Cyan* (#4F46E5 / #06B6D4) for accents and call-to-action buttons.
    *   *Stellar White* (#F8FAFC) for typography to ensure high contrast.
*   **UI Style:** 
    *   **Glassmorphism:** Use semi-transparent cards with blur effects to simulate cockpit displays.
    *   **Animations:** Subtle parallax scrolling (stars moving slower than content) and "pulsing" glow effects on key product features.
    *   **Typography:** A clean, geometric Sans-Serif (e.g., *Inter* or *Montserrat*) for English, and a modern Kufi style (e.g., *IBM Plex Sans Arabic*) for Arabic.

### 2. Page Structure & Content (المحتوى)
The page will be a high-conversion Single Page Application (SPA) divided into these sections:

| Section | Content (Arabic/English) | Purpose |
| :--- | :--- | :--- |
| **Hero Section** | **Headline:** "نبرمج المستقبل.. خارج حدود الأرض" <br> **Sub-headline:** "عدلات: حلول برمجية متقدمة للمنتجات الفضائية والأنظمة المدارية." | Immediate impact and value proposition. |
| **About Us** | Focus on the intersection of *Software Precision* and *Space Exploration*. Mentioning reliability in extreme environments. | Establishing authority. |
| **Products/Services** | 1. **Satellite OS:** Operating systems for nano-satellites. <br> 2. **Orbital Analytics:** AI for space debris and telemetry. <br> 3. **Ground Control Software:** Interface for mission management. | Showcasing the "Space Products" aspect. |
| **Tech Stack** | Icons of Rust, C++, Python, and Cloud-Native tools (Kubernetes/AWS Space). | Proving technical capability. |
| **Contact/CTA** | "انطلق معنا إلى المدار" (Launch with us) $\rightarrow$ Lead capture form. | Conversion. |

### 3. Technical Implementation (البناء)
I recommend the following stack for speed, SEO, and futuristic animations:
*   **Framework:** **Next.js 14** (App Router) for superior performance and SEO.
*   **Styling:** **Tailwind CSS** for rapid, responsive layout development.
*   **Animations:** **Framer Motion** for the "space-like" smooth transitions and entrance effects.
*   **Deployment:** **Vercel** or **Netlify** for global edge delivery.

---

## Current state vs gaps

| Element | Current State | Gap | Evidence Path |
| :--- | :--- | :--- | :--- |
| **Project Assets** | No existing assets for "Adlat" found in the repository. | Complete lack of branding, copy, or code for this specific entity. | `Not found` in `E:\UpNexa.com\maw3ed` |
| **Infrastructure** | General agency framework exists (Sam-Harness). | No specific "Space-Tech" template or component library. | `docs/PRODUCT_AND_PLATFORM_SPEC.md` |
| **Content** | User provided name and niche only. | Detailed product descriptions and "About" copy need to be authored. | `Original User Goal` |

---

## Concrete recommendations / next actions

1.  **Phase 1: Branding (Immediate)**
    *   Create a logo that combines a "Code Bracket `{}`" with an "Orbit/Planet" symbol.
    *   Finalize the Arabic/English copy for the three core space products.

2.  **Phase 2: Development (Sprint 1)**
    *   Initialize Next.js project with Tailwind CSS.
    *   Build the "Starfield" background component using CSS particles or a Canvas API.
    *   Implement the Hero and Services sections using Framer Motion.

3.  **Phase 3: Deployment (Sprint 2)**
    *   Connect a domain (e.g., `adlat.space` or `adlat.io`).
    *   Optimize for mobile devices (ensuring the "Space" feel translates to small screens).

---

## Risks & verification

*   **Risk:** The "Space" theme can become too "Sci-Fi" and look unprofessional/unreliable for a B2B software company.
    *   **Verification:** Conduct a design review against "Industrial Aerospace" benchmarks (e.g., SpaceX, Blue Origin) to ensure a balance of aesthetics and corporate trust.
*   **Risk:** Performance lag due to heavy animations.
    *   **Verification:** Run Google Lighthouse audits; ensure LCP (Largest Contentful Paint) is under 2.5s.

---

## Delivery / handoff notes

*   **Deliverables:** The final output will be a GitHub repository containing the Next.js source code and a deployed URL.
*   **Handoff:** Provide a `README.md` explaining how to update the "Products" section via a simple JSON file or CMS (Contentful/Sanity) so the client can add new space products without coding.

REJECTION:
# Audit v1/5
Result: [REJECTED]
goalPassed: false
goalFidelityScore: 0.333
goalFidelityReason: Goal fidelity FAIL (score=0.33; hits=عدلات|منتجات|فضائية|شكل)

[REJECTED]

### Issue 1
- أسباب الرفض / Rejection reason: Goal fidelity gate failed — strategy does not answer ORIGINAL USER GOAL (Goal fidelity FAIL (score=0.33; hits=عدلات|منتجات|فضائية|شكل)).
- درجة الخطورة / Severity: Critical
- طريقة الحل / How to fix: Rewrite strategy so the main body answers the user goal; remove unrelated BookingType/clinic content unless the goal asks for it. Cite evidence paths for memory/Daily Ops/UI when those are the subject.
FIX 1: Align strategy-v2 to: عاوز اعمل صفحة ويب عن شركة برمجة اسمها عدلات بتعمل منتجات فضائية وعاوز شكل الصفحة والمحتوي واببنيها

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