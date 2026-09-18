# Clerk — التحقق من البريد (OTP)

الهدف في موعد:

- **OTP مرة واحدة** عند **إنشاء حساب جديد** (تحقق البريد).
- **OTP مرة واحدة** عند **تغيير البريد** إلى ميل جديد فقط.
- بعد ذلك: دخول وخروج عادي بالبريد + كلمة المرور — **بدون أي OTP**.

الكود (`SignIn` + `withSignUp={false}`) لا يكفي وحده. Clerk يفرض OTP من إعدادات الـ Dashboard.

## السبب الأشيع لـ OTP عند كل دخول (مهم)

إذا ظهرت شاشة `#/factor-two` مع نص مثل:

> You're signing in from a new device…

فهذا **Device Trust** (كان يُسمى Client Trust)، وليس «تحقق التسجيل».  
Clerk يفعّله افتراضياً على التطبيقات الجديدة: بعد كلمة المرور الصحيحة على جهاز/متصفح جديد يطلب رمز بريد.

### عطّله هكذا

1. افتح [Clerk Dashboard](https://dashboard.clerk.com) → تطبيق موعد.
2. من القائمة: **Protect** → **Rules**.
3. صف **Device Trust** → **Manage**.
4. أوقف **Enable** → **Save**.

بعد الحفظ: الدخول من أي جهاز = بريد + كلمة مرور فقط (ما دام المستخدم لم يفعّل MFA يدوياً).

## باقي إعدادات User & authentication

1. **Email**
   - Require email address: مفعّل.
   - **Verify at sign-up**: Email verification code — مفعّل (مرة واحدة عند إنشاء الحساب).
2. **Sign-in**
   - Password: مفعّل.
   - **لا** تستخدم Email verification code كوسيلة تسجيل دخول أساسية.
3. **Multi-factor (MFA)**
   - لا تفرض MFA ببريد OTP على كل المستخدمين.
4. تغيير البريد من الملف الشخصي يرسل تحقق OTP للميل الجديد مرة واحدة — هذا مطلوب ومقصود.

## في الكود

- `src/ClerkGate.jsx`: `SignIn` مع `withSignUp={false}`.
- رسائل الواجهة توضح السياسة أعلاه.
- بدون ضبط الـ Dashboard (خصوصاً Device Trust)، المكوّنات وحدها **لا تمنع** OTP على الأجهزة الجديدة.
