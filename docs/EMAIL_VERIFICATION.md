# التحقق من البريد الإلكتروني

يستخدم Maw3ed اتصال Gmail المضاف إلى Replit لإرسال رمز تحقق مؤقت من 6 أرقام.

## التدفق

1. يرسل العميل `POST /api/auth/request-verification` مع `email` و`locale` اختيارياً.
2. ينشئ الخادم رمزاً عشوائياً صالحاً لمدة 10 دقائق.
3. يُخزن الخادم hash الرمز فقط في PostgreSQL.
4. يرسل Gmail الرسالة عبر `users/me/messages/send`.
5. يؤكد العميل الرمز عبر `POST /api/auth/verify-email`.

صلاحيات Gmail المستخدمة هي الصلاحيات التي يمنحها اتصال Replit، وأهمها `gmail.send` و`gmail.compose` دون تخزين رموز OAuth أو كلمات المرور في المستودع.

## وضع التطوير

لاستخدام outbox محلي بدلاً من إرسال Gmail:

```text
MAW3ED_EMAIL_MODE=outbox
```

الوضع الافتراضي يستخدم Gmail المتصل. فشل Gmail يظهر كخطأ واضح ولا يتحول بصمت إلى outbox.