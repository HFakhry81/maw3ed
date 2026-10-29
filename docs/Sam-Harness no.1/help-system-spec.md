Since **Maw3ed** is a multi-tenant, multi-vertical platform (Medical, Beauty, Sports, Education), the Help & Support module cannot be generic. It must be **context-aware**, meaning a Yoga instructor sees different help than a Clinic receptionist or a Gaming Pod client.

Below is the complete design for the **Maw3ed Help & Support Module**.

---

## 1. Module Architecture: "Contextual Assistance"
The module will operate on a **Layered Help Strategy**:
1. **Self-Service (L1):** FAQ & Searchable Knowledge Base.
2. **Contextual (L2):** Screen-level "Tooltips" and "Guided Tours."
3. **Direct Support (L3):** Escalation to Ticket/Chat (Tenant-specific).

### Technical Integration
- **HelpController:** REST API to fetch FAQ categories based on `tenant_id` and `user_role`.
- **ContextMapper:** A utility that maps the current `ScreenID` or `BookingType` to a specific help article.
- **SupportTicketService:** Handles the escalation flow from the UI to the Admin Dashboard.

---

## 2. FAQ & Knowledge Base (The Hub)
The FAQ is partitioned by **User Role** and **Vertical**.

### UI Structure
- **Search Bar:** "How can we help you today?" / "كيف يمكننا مساعدتك اليوم؟"
- **Category Tiles:**
    - **For Clients:** Booking, Payments, QR Codes.
    - **For Staff:** Check-ins, Attendance, Schedule.
    - **For Admins:** Resource Mapping, Tenant Config, Billing.

### Arabic UI Labels
| English Label | Arabic Translation | Usage |
| :--- | :--- | :--- |
| Help Center | مركز المساعدة | Main Module Title |
| Frequently Asked Questions | الأسئلة الشائعة | FAQ Section |
| Search for a topic... | ابحث عن موضوع... | Search Placeholder |
| Contact Support | التواصل مع الدعم | Escalation Button |
| Was this helpful? | هل كان هذا مفيداً؟ | Feedback Loop |

---

## 3. Screen-Level Help (Contextual)
Instead of a manual, Maw3ed will use **"Just-in-Time"** help based on the `BookingType` triad.

### A. The "Help Bubble" (Floating `?` Icon)
Placed in the top right of every screen. Clicking it opens a side-drawer with content mapped to the current page.

**Example Mappings:**
- **Screen:** `Booking_Creation` $\rightarrow$ **Help:** "How to choose between Exclusive vs. Batch mode."
- **Screen:** `QR_Scanner` $\rightarrow$ **Help:** "What to do if a QR code is expired or invalid."
- **Screen:** `Invoice_View` $\rightarrow$ **Help:** "Understanding the Base Price vs. Duration calculation."

### B. Guided Tours (Onboarding)
For new Staff/Admins, a step-by-step overlay:
- **Step 1:** "Welcome to Maw3ed! Start by mapping your Staff to a Branch."
- **Step 2:** "Define your Resource (e.g., Room 1 or Yoga Studio)."
- **Step 3:** "Set your Occupancy Mode (Exclusive for 1:1, Capacity for Groups)."

---

## 4. Empty & Error States (The "Safety Net")
To prevent user frustration during technical gaps (as identified in the Gap Analysis), we use **Actionable Error States**.

### A. Empty States
*When a user lands on a page with no data.*
- **UI:** Illustration $\rightarrow$ Clear Text $\rightarrow$ Primary Action Button.
- **Example (No Bookings):** 
    - *Text:* "No bookings found for today." / "لا توجد حجوزات لليوم."
    - *Action:* [Create New Booking] / [إنشاء حجز جديد]

### B. Error States (The "Recovery" Path)
*When a system failure occurs (e.g., QR Validation fails).*
- **UI:** Error Icon $\rightarrow$ Human-readable reason $\rightarrow$ Support Link.
- **Example (QR Failure):**
    - *Text:* "Invalid QR Code. The session may have expired." / "رمز QR غير صالح. قد تكون الجلسة قد انتهت."
    - *Action:* [Contact Branch Manager] / [تواصل مع مدير الفرع]

---

## 5. Support Escalation Flow (L3)
If the FAQ and Tooltips fail, the user enters the