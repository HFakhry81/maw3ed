#!/usr/bin/env node
/**
 * Drain transactional outbox once (or until idle).
 *
 *   MAW3ED_OUTBOX_WORKER=1 node scripts/outbox-worker.js
 *   node scripts/outbox-worker.js --force --once
 *   node scripts/outbox-worker.js --force --until-idle
 */
const { processBatch, processUntilIdle, workerStatus } = require("../outboxDeliveryWorker");

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force") || process.env.MAW3ED_OUTBOX_WORKER === "1";
  const untilIdle = args.includes("--until-idle");
  const statusOnly = args.includes("--status");

  if (statusOnly) {
    console.log(JSON.stringify({ ok: true, status: workerStatus() }, null, 2));
    return;
  }

  if (!force) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          skipped: true,
          reason: "worker_disabled",
          hint: "Pass --force or set MAW3ED_OUTBOX_WORKER=1"
        },
        null,
        2
      )
    );
    process.exitCode = 2;
    return;
  }

  const result = untilIdle
    ? await processUntilIdle({ force: true, maxBatches: 20 })
    : await processBatch({ force: true, limit: 50 });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
