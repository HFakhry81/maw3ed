/**
 * Shared console UX for Maw3ed demo seed / cleanup scripts.
 * Bilingual banners (AR + EN) matching the unified demo setup.
 */
"use strict";

const {
  SECTION_TARGETS,
  PLATFORM_ADMIN_EMAIL,
  KEEP_USER_EMAILS,
  CANONICAL_SEED,
  SUMMARY_PATH
} = require("./demo-seed-store");
const path = require("path");

const rootDir = path.join(__dirname, "..");

function rel(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function line(char = "═", width = 72) {
  return char.repeat(width);
}

function printBanner(titleAr, titleEn) {
  console.log(line());
  console.log(`  ${titleAr}`);
  console.log(`  ${titleEn}`);
  console.log(line());
}

function printDemoMap() {
  console.log("  البذرة الموحدة / Unified demo seed");
  console.log(`    file: ${rel(CANONICAL_SEED)}`);
  console.log(`    summary: ${rel(SUMMARY_PATH)}`);
  console.log("");
  console.log("  الأقسام / Sections");
  console.log(
    `    medical   → ${SECTION_TARGETS.medical.ownerEmail}  / ${SECTION_TARGETS.medical.preferredSlug}`
  );
  console.log(
    `    education → ${SECTION_TARGETS.education.ownerEmail} / ${SECTION_TARGETS.education.preferredSlug}`
  );
  console.log("");
  console.log("  المستخدمون الثلاثة / Keep exactly 3 users");
  console.log(`    platform admin → ${PLATFORM_ADMIN_EMAIL}  (super_admin, no workspace)`);
  console.log(`    owners         → ${SECTION_TARGETS.medical.ownerEmail}`);
  console.log(`                   → ${SECTION_TARGETS.education.ownerEmail}`);
  console.log(`    keep list      → ${KEEP_USER_EMAILS.join(", ")}`);
  console.log("");
  console.log("  الأوامر / Commands");
  console.log("    npm run seed:demo:restore");
  console.log("    npm run seed:demo:save -- --section=medical|education");
  console.log("    npm run users:cleanup-demo-owners -- --dry-run");
  console.log("    npm run users:cleanup-demo-owners -- --apply");
  console.log("");
  console.log("  ملاحظة: npm run migrate / npm run seed لا يستعيدان بذرة العروض.");
  console.log("  Note: migrate/seed do NOT load this demo blob.");
}

function logInfo(tag, message) {
  console.log(`[${tag}] ${message}`);
}

function logOk(tag, message) {
  console.log(`[${tag}] ✓ ${message}`);
}

function logWarn(tag, message) {
  console.log(`[${tag}] ! ${message}`);
}

function logFail(tag, message) {
  console.error(`[${tag}] ✗ ${message}`);
}

function printUsageBlock(lines) {
  console.log("");
  for (const row of lines) console.log(row);
  console.log("");
}

module.exports = {
  line,
  printBanner,
  printDemoMap,
  logInfo,
  logOk,
  logWarn,
  logFail,
  printUsageBlock,
  rel
};
