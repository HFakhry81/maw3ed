Since **Maw3ed** is an Operational Resource Orchestrator, the Help & Support module cannot be a static "Contact Us" page. It must be **context-aware**, meaning the help provided to a Client booking a Padel court differs from the help provided to a Staff member scanning a QR code.

Below is the complete design for the **Maw3ed Support Orchestrator**.

---

## 1. Conceptual Framework: "The Support Pyramid"
We implement a tiered resolution strategy to reduce operational overhead for the Tenant Admin.

1.  **Tier 0 (Self-Serve):** Contextual Tooltips & Empty States (Prevent the question).
2.  **Tier 1 (Guided):** Dynamic FAQ & Search (Answer the question).
3.  **Tier 2 (Direct):** Ticket Submission/Chat (Resolve the specific issue).
4.  **Tier 3 (Escalation):** Tenant Admin $\rightarrow$ UpNexa (System-level failure).

---

## 2. UI/UX Component Design

### A. Contextual Help (The "Help Bubble")
Instead of a global help menu, every complex screen (e.g., the Calendar or Booking Engine) features a **Contextual Help Trigger**.

*   **UI Element:** A small `(?)` icon in the top right of the module.
*   **Behavior:** Clicking it opens a side-drawer (Slide-over) containing only the FAQs relevant to that specific screen.
*   **Arabic Label:** `مركز المساعدة` (Help Center) or `كيف يعمل هذا؟` (How does this work?).

### B. Empty & Error States (The "Guidance" Layer)
Empty states are converted into "Onboarding" moments.

| State | UI Message (English) | UI Message (Arabic) | Action Button |
| :--- | :--- | :--- | :--- |
| **No Bookings** | "Your schedule is clear! Start by adding a resource." | "جدولك فارغ حالياً! ابدأ بإضافة مورد جديد." | `[+ Add Resource]` |
| **No Search Results** | "We couldn't find that slot. Try adjusting your filters." | "لم نجد مواعيد متاحة. جرب تغيير الفلاتر." | `[Reset Filters]` |
| **Payment Failed** | "Payment declined. Please check your card details." | "فشلت عملية الدفع. يرجى التحقق من بيانات البطاقة." | `[Try Again]` |
| **QR Scan Error** | "Invalid QR Code. Please ensure you are at the correct venue." | "رمز QR غير صالح. تأكد من تواجدك في الموقع الصحيح." | `[Contact Staff]` |

---

## 3. The Support Module Architecture

### A. The Knowledge Base (KB) Schema
To support multi-tenancy, the KB is split into **Global** (UpNexa) and **Tenant-Specific** content.

*   **Global KB:** General "How to use Maw3ed" guides.
*   **Tenant KB:** Custom rules (e.g., "Our Padel Court cancellation policy is 24 hours").

**Data Model:**
`HelpArticle` $\rightarrow$ `{ id, tenant_id (nullable), category, title, content, tags[], context_screen_id }`

### B. Escalation Workflow (The Ticket System)
When self-serve fails, the user initiates a support request.

1.  **Trigger:** User clicks `Contact Support` $\rightarrow$ `طلب دعم`
2.  **Context Capture:** The system automatically attaches:
    *   `User_Role` (Client/Staff/Admin)
    *   `Current_Screen` (e.g., `/bookings/checkout`)
    *   `Tenant_ID`
    *   `Device_Info`
3.  **Routing Logic:**
    *   **Client $\rightarrow$ Tenant Admin:** (e.g., "I want a refund").
    *   **Staff $\rightarrow$ Tenant Admin:** (e.g., "The QR scanner is lagging").
    *   **Tenant Admin $\rightarrow$ UpNexa:** (e.g., "API Gateway is returning 500 errors").

---

## 4. User-Specific Support Journeys

### Journey 1: The Client (Booking App)
*   **Pain Point:** "I can't find an available slot."
*   **Support Path:** 
    1.  **Empty State:** "No slots available" $\rightarrow$ Suggests "Notify me when a slot opens."
    2.  **FAQ:**