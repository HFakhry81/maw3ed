# سجل تطوير مشروع Maw3ed

هذا الملف يُحدّث تلقائياً من `scripts/development-log.js`.

## الاستخدام السريع

```bash
# بدء تعديل بهدف واضح
npm run change:start -- --title "عنوان التعديل" --goal "النتيجة المطلوبة" --scope "الملفات أو المجال"

# تسجيل مراحل التنفيذ
npm run change:stage -- --id "change-id" --name "التنفيذ" --details "ما تم إنجازه"
npm run change:stage -- --id "change-id" --name "التحقق" --details "الفحوصات التي نجحت"

# إنهاء التعديل وتوليد تقرير النهاية
npm run change:finish -- --id "change-id" --summary "ما تم إنجازه" --verification "npm run build"

# مراقبة تلقائية لجلسة تعديل؛ Ctrl+C ينشئ تقرير النهاية
npm run change:watch -- --title "تعديل جديد" --goal "الهدف من التعديل" --scope "النطاق"

# إعادة توليد التقرير المقروء
npm run change:report
```

## قواعد التسجيل

1. يبدأ كل تعديل بعنوان وهدف ونطاق واضح.
2. تسجل كل مرحلة كتحديث مستقل مع وقتها وتفاصيلها.
3. لا يُعتبر التعديل مكتملًا قبل تسجيل التحقق وتقرير النهاية.
4. السجل الآلي الكامل موجود في `data/development-log.jsonl`.
5. وضع المراقبة يسجل تغيّر الملفات تلقائياً أثناء جلسة التعديل.