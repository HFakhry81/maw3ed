# Clerk — التحقق من البريد (OTP)

الهدف في موعد: **OTP مرة واحدة عند إنشاء الحساب**، ومرة أخرى فقط عند **تغيير البريد**. تسجيل الدخول = بريد + كلمة مرور فقط.

## إعدادات Clerk Dashboard (إلزامي)

1. افتح [Clerk Dashboard](https://dashboard.clerk.com) → التطبيق → **User & authentication**.
2. **Email**
   - فعّل Require email address.
   - **Verify at sign-up**: Email verification code (أو link) — يبقى مفعّلاً للتسجيل.
3. **Sign-in**
   - فعّل **Password**.
   - **عطّل** Email verification code كوسيلة تسجيل دخول (لا تستخدم OTP في كل دخول).
4. **Multi-factor / Device Trust**
   - لا تفرض MFA ببريد OTP لكل جلسة.
   - إن ظهر رمز عند كل جهاز جديد بسبب Device Trust، عطّل استراتيجية البريد هناك أو اضبط الثقة بما يناسب الاختبار.
5. عند تغيير البريد من الملف الشخصي، Clerk يرسل تحقق OTP تلقائياً — هذا مطلوب ومقصود.

## في الكود

- `SignIn` يعمل مع `withSignUp={false}` (مسار دخول منفصل عن التسجيل).
- رسائل الواجهة توضح: لا OTP في كل دخول.

بدون ضبط الـ Dashboard، المكوّنات وحدها لا تمنع OTP إذا كان مفعّلاً كاستراتيجية دخول.
