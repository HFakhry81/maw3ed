/**
 * استرجاع بيانات المستشفى الكاملة (البذرة المحفوظة).
 *
 * المصدر الثابت:
 *   data/seeds/medical-demo-ops.json
 *   (~248 موظف · ~225 خدمة · 10 عملاء · 15 قسم)
 *
 * الاستخدام من جذر المشروع:
 *   npm run hospital:restore-full
 *   node scripts/restore-full-hospital-data.js
 *   node scripts/restore-full-hospital-data.js --owner-email=contact.haitham@gmail.com
 *   node scripts/restore-full-hospital-data.js --workspace=<id>
 *   node scripts/restore-full-hospital-data.js --replace
 *
 * افتراضياً تُستعاد البذرة إلى مساحة المعمل الطبية المملوكة للحساب أعلاه.
 * الاستعادة تدمج السجلات افتراضياً؛ استخدم --replace للاستبدال الكامل.
 *
 * بعد الانتهاء حدّث صفحة المتصفح.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const seedScript = path.join(__dirname, "seed-medical-demo.js");
const args = process.argv.slice(2).filter((a) => a !== "--restore");

console.log("");
console.log("══════════════════════════════════════════════");
console.log("  استرجاع بيانات المستشفى الكاملة");
console.log("  restore-full-hospital-data");
console.log("══════════════════════════════════════════════");
console.log(`  الملف: data/seeds/medical-demo-ops.json`);
console.log("");

const result = spawnSync(
  process.execPath,
  [seedScript, "--restore", ...args],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env
  }
);

if (result.error) {
  console.error("[hospital:restore-full] FAILED:", result.error.message);
  process.exit(1);
}

const code = result.status == null ? 1 : result.status;
if (code === 0) {
  console.log("");
  console.log("تم فرد بيانات المستشفى الكاملة على مساحة العمل.");
  console.log("حدّث المتصفح الآن (F5).");
  console.log("");
}
process.exit(code);
