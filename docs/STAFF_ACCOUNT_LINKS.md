# ربط حساب الدخول بسجل الموظف (desk attribution)

**تاريخ القرار:** 2026-10-27  
**الحالة:** منفّذ بالحد الأدنى (migration + JSON + enforcement + اختبارات)

## قرار المالك (النموذج الكانوني)

1. حساب الدخول الواحد (`app_users` / Clerk) يمكنه العمل في **عدة مساحات عمل**.
2. ملف الموظف/مقدم الخدمة (`workspace_ops_staff` أو `staff` في JSON) **منفصل** عن تسجيل الدخول.
3. جدول/ملف ربط (junction): مستخدم ↔ موظف داخل **مساحة عمل** واحدة في كل صف.
4. في Maw3ed لا يوجد كيان `branch` منفصل؛ **الفرع = `workspace_id`** (مساحة العمل هي حد العزل التشغيلي الحالي). مواقع متعددة = عدة workspaces وعضويات.
5. داخل مساحة واحدة: **واحد-لواحد** — كل مستخدم يربط على الأكثر بموظف واحد، وكل موظف يربط على الأكثر بمستخدم واحد.
6. صلاحيات desk لدور `staff` تُمنَح فقط عند وجود صف ربط **نشط** للسياق المختار؛ وإلا رفض fail-closed.
7. بعد الربط، الـ desk مقصور على زيارات/`staffId` المرتبط — ليس المنشأة كلها. تسعير الإضافات يبقى للمالك/المسؤول.
8. اختيار السياق: إن وُجدت عضويات متعددة يعرض العميل قائمة؛ كل طلب ops يثبت العضوية والربط على الخادم. `x-workspace-id` سياق مقترح فقط.

## التخزين

| المسار | الموقع |
| --- | --- |
| PostgreSQL | `workspace_staff_links` (migration `012_workspace_staff_links.sql`) مع FK مركّب إلى `workspace_ops_staff(workspace_id, id)` وقيود UNIQUE على `(workspace_id, user_id)` و`(workspace_id, staff_id)` |
| JSON المحلي | `data/workspaces/<workspaceId>/staff-links.json` |
| عضوية الدخول | `workspace_members` (+ عمود `status` أُضيف في 012 ليطابق استعلام الخادم) |

## واجهات

- `GET /api/account/contexts` وضمن `GET /api/account` و`GET /api/workspaces` — سياقات قابلة للاختيار مع `staffLink` و`deskAllowed`
- `GET /api/ops/contexts` — السياق الحالي المثبت + هل desk مسموح
- `GET /api/ops/staff-link` — ربط المستخدم الحالي في المساحة
- `GET /api/ops/staff-links` — قائمة الروابط (owner/admin)
- `PUT /api/ops/staff/:id/account-link` `{ userId, roleInWorkspace?, status? }`
- `DELETE /api/ops/staff/:id/account-link` — تعليق الربط

التنفيذ: [`staffLinks.js`](../staffLinks.js)، السياسة في [`opsRoutes.js`](../opsRoutes.js).

## تحقق

```bash
npm run test:staff-links
npm run test:ops-rbac
node --check staffLinks.js
```
