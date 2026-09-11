const fs = require("fs");
const path = require("path");
const { ReplitConnectors } = require("@replit/connectors-sdk");

const outboxFile = path.join(__dirname, "data", "email-outbox.jsonl");
const connectors = new ReplitConnectors();

function encodeMimeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendHtmlWithGmail({ to, subject, html }) {
  const profileResponse = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile", { method: "GET" });
  if (!profileResponse.ok) throw new Error(`Gmail profile request failed with status ${profileResponse.status}`);
  const profile = await profileResponse.json();
  const rawMessage = [
    `From: Maw3ed <${profile.emailAddress}>`,
    `To: ${to || profile.emailAddress}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html
  ].join("\r\n");
  const response = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodeBase64Url(rawMessage) })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gmail send failed with status ${response.status}: ${errorBody.slice(0, 200)}`);
  }
  return { mode: "gmail", sender: profile.emailAddress };
}

async function sendWithGmail({ email, code, locale }) {
  const direction = locale === "ar" ? "rtl" : "ltr";
  const subject = locale === "ar" ? "رمز التحقق من بريدك — موعد" : "Your Maw3ed verification code";
  const html = `<div style="font-family:Arial,sans-serif;direction:${direction}"><h2 style="color:#0b369c">Maw3ed</h2><p>${locale === "ar" ? "رمز التحقق الخاص بك هو:" : "Your verification code is:"}</p><strong style="font-size:28px;letter-spacing:6px">${code}</strong><p>${locale === "ar" ? "ينتهي الرمز خلال 10 دقائق." : "This code expires in 10 minutes."}</p><hr><small>UpNexa-eg.com</small></div>`;
  return sendHtmlWithGmail({ to: email, subject, html });
}

async function sendVerificationEmail({ email, code, locale }) {
  if (process.env.MAW3ED_EMAIL_MODE !== "outbox") return sendWithGmail({ email, code, locale });

  fs.mkdirSync(path.dirname(outboxFile), { recursive: true });
  const current = fs.existsSync(outboxFile) ? fs.readFileSync(outboxFile, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(outboxFile, `${separator}${JSON.stringify({ createdAt: new Date().toISOString(), to: email, code, type: "verification", mode: "development" })}\n`, "utf8");
  return { mode: "development-outbox" };
}

async function sendSubscriptionRequestEmail({ user, workspace, plan }) {
  const direction = workspace.locale === "ar" ? "rtl" : "ltr";
  const subject = `طلب اشتراك ${plan.display_name} — ${workspace.name}`;
  const html = `<div style="font-family:Arial,sans-serif;direction:${direction}"><h2 style="color:#0b369c">طلب اشتراك جديد في Maw3ed</h2><p><strong>المؤسسة:</strong> ${workspace.name}</p><p><strong>النشاط:</strong> ${workspace.activity_type}</p><p><strong>البريد:</strong> ${user.email}</p><p><strong>الخطة:</strong> ${plan.display_name}</p><p><strong>السعر المقترح:</strong> ${plan.price_usd} USD / ${plan.billing_period_days} يوم</p><p>الطلب معلّق وينتظر موافقة مسؤول المنصة من لوحة الإدارة.</p><hr><small>UpNexa-eg.com · Maw3ed</small></div>`;
  if (process.env.MAW3ED_EMAIL_MODE === "outbox") {
    fs.mkdirSync(path.dirname(outboxFile), { recursive: true });
    const current = fs.existsSync(outboxFile) ? fs.readFileSync(outboxFile, "utf8") : "";
    const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(outboxFile, `${separator}${JSON.stringify({ createdAt: new Date().toISOString(), type: "subscription-request", workspace: workspace.name, plan: plan.plan_key, mode: "development" })}\n`, "utf8");
    return { mode: "development-outbox" };
  }
  return sendHtmlWithGmail({ to: null, subject, html });
}

module.exports = { sendVerificationEmail, sendSubscriptionRequestEmail };