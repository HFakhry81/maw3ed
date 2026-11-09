#!/usr/bin/env node
/**
 * Reliable CI quality gate: syntax-check tracked JS/MJS/CJS without secrets,
 * Postgres, or smoke/integration runners.
 * English-only ASCII console output.
 */
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const SKIP_DIR_PARTS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  "mobile",
  "data",
]);

function shouldSkip(relPosix) {
  const parts = relPosix.split("/");
  return parts.some((p) => SKIP_DIR_PARTS.has(p));
}

function listTracked() {
  const res = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    console.error("[ci:syntax] FAIL: git ls-files failed");
    process.exit(1);
  }
  const buf = res.stdout || Buffer.alloc(0);
  const out = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      if (i > start) out.push(buf.slice(start, i).toString("utf8"));
      start = i + 1;
    }
  }
  if (start < buf.length) out.push(buf.slice(start).toString("utf8"));
  return out;
}

const files = listTracked().filter((rel) => {
  if (shouldSkip(rel.replace(/\\/g, "/"))) return false;
  return /\.(js|mjs|cjs)$/i.test(rel);
});

if (files.length === 0) {
  console.error("[ci:syntax] FAIL: no JS files found to check");
  process.exit(1);
}

let failed = 0;
for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const check = spawnSync(process.execPath, ["--check", abs], {
    cwd: root,
    encoding: "utf8",
  });
  if (check.status !== 0) {
    failed += 1;
    console.error(`[ci:syntax] FAIL: ${rel}`);
    const err = String(check.stderr || check.stdout || "").trim();
    if (err) console.error(err);
  }
}

if (failed) {
  console.error(`[ci:syntax] FAIL: ${failed} file(s) failed syntax check (of ${files.length})`);
  process.exit(1);
}

console.log(`[ci:syntax] OK: ${files.length} file(s) passed node --check`);
process.exit(0);
