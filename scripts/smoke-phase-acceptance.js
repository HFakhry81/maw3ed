#!/usr/bin/env node
/**
 * Phase 8 — aggregate phase 1–7 (+ posture) acceptance entry.
 * Runs each suite as a child process; skipped PG drills count as ok when suite exits 0.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

const SUITES = [
  { id: "phase1-security", npm: "test:phase1-security" },
  { id: "phase2-data", npm: "test:phase2-data" },
  { id: "phase3-booking", npm: "test:phase3-booking" },
  { id: "phase4-capacity", npm: "test:phase4-capacity" },
  { id: "phase5-journeys", npm: "test:phase5-journeys" },
  { id: "phase6-integrations", npm: "test:phase6-integrations" },
  { id: "phase7-ops", npm: "test:phase7-ops" },
  { id: "phase8-posture", npm: "test:phase8-posture" }
];

function runSuite(suite) {
  const started = Date.now();
  const result = spawnSync("npm", ["run", suite.npm], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: false
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  let parsed = null;
  try {
    const start = output.lastIndexOf("{");
    if (start >= 0) parsed = JSON.parse(output.slice(start));
  } catch {
    parsed = null;
  }
  return {
    id: suite.id,
    npm: suite.npm,
    ok: result.status === 0,
    status: result.status,
    ms: Date.now() - started,
    skipped: Boolean(parsed && parsed.skipped),
    summary: parsed
      ? {
          ok: parsed.ok,
          suite: parsed.suite,
          skipped: parsed.skipped || false,
          checks: Array.isArray(parsed.checks) ? parsed.checks.length : undefined
        }
      : null,
    tail: output.slice(-500)
  };
}

function main() {
  const only = process.argv.includes("--posture-only")
    ? SUITES.filter((suite) => suite.id === "phase8-posture")
    : SUITES;
  const results = [];
  for (const suite of only) {
    process.stderr.write(`[phase-acceptance] running ${suite.npm}…\n`);
    results.push(runSuite(suite));
  }
  const failed = results.filter((row) => !row.ok);
  const report = {
    ok: failed.length === 0,
    suite: "smoke-phase-acceptance",
    phases: results,
    failed: failed.map((row) => row.id),
    manualOwnerGates: [
      "Signed Sam-PC restore drill (test:ops-pg-backup:full on 5432/maw3ed)",
      "Owner RPO/RTO approval",
      "Manual booking journey on phone/browser (see PRE_LAUNCH_ACCEPTANCE_CHECKLIST.md)",
      "Go/No-Go decision (see GO_NO_GO_CHECKLIST.md) — owner only; no auto pilot"
    ],
    optionalHttpGate: "npm run check:staging",
    note: "Automated gates only. Does not enable Stripe/WhatsApp/hosted checkout or launch a pilot."
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main();
