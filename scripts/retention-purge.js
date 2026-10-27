#!/usr/bin/env node
/**
 * Purge operational JSONL logs by retention policy (Phase 7).
 *
 *   node scripts/retention-purge.js --dry-run
 *   node scripts/retention-purge.js --apply
 */
const { purgeOperationalLogs, getRetentionPolicy } = require("../dataRetention");

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");
  if (args.includes("--policy")) {
    console.log(JSON.stringify({ ok: true, policy: getRetentionPolicy(process.env) }, null, 2));
    return;
  }
  const result = purgeOperationalLogs({ dryRun });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  if (dryRun) {
    console.error("[retention-purge] dry-run only; pass --apply to rewrite files");
  }
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
