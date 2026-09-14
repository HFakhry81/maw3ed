const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const dataDirectory = path.join(root, "data");
const logFile = path.join(dataDirectory, "development-log.jsonl");
const reportFile = path.join(root, "DEVELOPMENT_LOG.md");

fs.mkdirSync(dataDirectory, { recursive: true });

function parseArgs(argv) {
  const args = {};
  let positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[rawKey] = next;
      index += 1;
    } else {
      args[rawKey] = true;
    }
  }
  args.command = positional.shift() || "report";
  return { ...args, positional };
}

function getText(args, key, fallback = "") {
  const value = args[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function now() {
  return new Date().toISOString();
}

function createId() {
  return `change-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function runGit(command, fallback = "") {
  try {
    return execFileSync("git", command, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

function snapshot() {
  const status = runGit(["status", "--short"]);
  const diff = runGit(["diff", "--stat"]);
  const files = status.split("\n").filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean);
  return {
    branch: runGit(["branch", "--show-current"], "unknown"),
    files,
    status,
    diffStat: diff
  };
}

function readRecords() {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function append(record) {
  fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`, "utf8");
  renderReport(readRecords());
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function groupedChanges(records) {
  const changes = new Map();
  for (const record of records) {
    if (!record.changeId) continue;
    if (!changes.has(record.changeId)) changes.set(record.changeId, { id: record.changeId, stages: [] });
    const change = changes.get(record.changeId);
    if (record.type === "change_started") Object.assign(change, record);
    if (record.type === "change_stage") change.stages.push(record);
    if (record.type === "change_finished") Object.assign(change, record);
  }
  return [...changes.values()].sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")));
}

function renderReport(records = readRecords()) {
  const changes = groupedChanges(records);
  const completed = changes.filter((change) => change.status === "completed").length;
  const active = changes.filter((change) => !["completed", "cancelled"].includes(change.status)).length;
  const lines = [
    "# سجل تطوير مشروع Maw3ed",
    "",
    "> هذا الملف يُحدّث تلقائياً من `scripts/development-log.js`. لا تعدّل الإدخالات يدوياً؛ استخدم أوامر سجل التطوير.",
    "",
    `آخر تحديث: ${now()}`,
    "",
    "## ملخص النمو",
    "",
    `- التعديلات المكتملة: **${completed}**`,
    `- التعديلات المفتوحة: **${active}**`,
    `- السجل الآلي: \`data/development-log.jsonl\``,
    "",
    "## مراحل التعديلات",
    ""
  ];
  if (!changes.length) lines.push("لا توجد تعديلات مسجلة بعد.");
  for (const change of changes) {
    const status = change.status === "completed" ? "مكتمل" : change.status === "cancelled" ? "ملغى" : "قيد التنفيذ";
    lines.push(`### ${escapeMarkdown(change.title || "تعديل بدون عنوان")} — ${status}`);
    lines.push("");
    lines.push(`- **المعرّف:** \`${change.id}\``);
    lines.push(`- **بدأ في:** ${change.startedAt || "غير محدد"}`);
    if (change.finishedAt) lines.push(`- **انتهى في:** ${change.finishedAt}`);
    lines.push(`- **الهدف:** ${escapeMarkdown(change.goal || "غير موثق")}`);
    if (change.scope) lines.push(`- **النطاق:** ${escapeMarkdown(change.scope)}`);
    if (change.branch) lines.push(`- **الفرع:** \`${escapeMarkdown(change.branch)}\``);
    lines.push("");
    lines.push("| المرحلة | الوقت | التفاصيل |");
    lines.push("| --- | --- | --- |");
    if (!change.stages.length) lines.push("| بدء التعديل | — | لم تُسجل مرحلة بعد |");
    for (const stage of change.stages) {
      lines.push(`| ${escapeMarkdown(stage.name)} | ${stage.timestamp} | ${escapeMarkdown(stage.details || "—")} |`);
    }
    if (change.summary) {
      lines.push("");
      lines.push(`**تقرير النهاية:** ${escapeMarkdown(change.summary)}`);
    }
    if (change.verification) lines.push(`**التحقق:** ${escapeMarkdown(change.verification)}`);
    if (change.files?.length) lines.push(`**الملفات المتأثرة:** ${change.files.map((file) => `\`${file}\``).join(", ")}`);
    lines.push("");
  }
  fs.writeFileSync(reportFile, `${lines.join("\n")}\n`, "utf8");
}

function findChange(changeId) {
  const records = readRecords();
  const change = groupedChanges(records).find((item) => item.id === changeId);
  if (!change) throw new Error(`Change ${changeId || "unknown"} was not found`);
  return change;
}

function startChange(args) {
  const title = getText(args, "title");
  const goal = getText(args, "goal");
  if (!title || !goal) throw new Error("start requires --title and --goal");
  const record = {
    type: "change_started",
    changeId: createId(),
    startedAt: now(),
    status: "in_progress",
    title,
    goal,
    scope: getText(args, "scope"),
    source: "development-log-cli",
    ...snapshot()
  };
  append(record);
  console.log(`Started ${record.changeId}`);
  return record.changeId;
}

function stageChange(args) {
  const changeId = getText(args, "id") || args.positional[0];
  const name = getText(args, "name") || args.positional[1];
  if (!changeId || !name) throw new Error("stage requires --id and --name");
  findChange(changeId);
  const record = {
    type: "change_stage",
    changeId,
    timestamp: now(),
    name,
    details: getText(args, "details"),
    source: "development-log-cli"
  };
  append(record);
  console.log(`Recorded stage ${name} for ${changeId}`);
}

function finishChange(args, automatic = false) {
  const changeId = getText(args, "id") || args.positional[0];
  if (!changeId) throw new Error("finish requires --id");
  findChange(changeId);
  const current = snapshot();
  const record = {
    type: "change_finished",
    changeId,
    finishedAt: now(),
    status: getText(args, "status", "completed"),
    summary: getText(args, "summary", automatic ? "انتهت جلسة المراقبة وتم جمع ملخص الملفات المعدلة." : ""),
    verification: getText(args, "verification"),
    files: current.files,
    diffStat: current.diffStat,
    source: "development-log-cli"
  };
  append(record);
  console.log(`Finished ${changeId}`);
}

function watchChange(args) {
  const changeId = startChange(args);
  let previous = JSON.stringify(snapshot());
  append({ type: "change_stage", changeId, timestamp: now(), name: "بدء المراقبة التلقائية", details: "سيتم تسجيل تغيّر الملفات تلقائياً.", source: "development-log-watcher" });
  const interval = setInterval(() => {
    const current = JSON.stringify(snapshot());
    if (current === previous) return;
    previous = current;
    const state = JSON.parse(current);
    append({
      type: "change_stage",
      changeId,
      timestamp: now(),
      name: "تعديل مكتشف تلقائياً",
      details: state.files.length ? `الملفات الحالية: ${state.files.join(", ")}` : "تم تحديث حالة المستودع.",
      source: "development-log-watcher"
    });
  }, Number(getText(args, "interval", "2000")));
  const stop = () => {
    clearInterval(interval);
    finishChange({ ...args, id: changeId }, true);
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`Watching ${changeId}. Press Ctrl+C to finish and write the final report.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "start") return startChange(args);
  if (args.command === "stage") return stageChange(args);
  if (args.command === "finish") return finishChange(args);
  if (args.command === "watch") return watchChange(args);
  if (args.command === "report") {
    renderReport();
    console.log(fs.readFileSync(reportFile, "utf8"));
    return;
  }
  throw new Error(`Unknown command ${args.command}. Use start, stage, finish, watch or report.`);
}

try {
  main();
} catch (error) {
  console.error(`Development log error: ${error.message}`);
  process.exitCode = 1;
}