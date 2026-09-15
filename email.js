const fs = require("fs");
const path = require("path");

const outboxFile = path.join(__dirname, "data", "email-outbox.jsonl");

function encodeMimeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function appendOutbox(entry) {
  fs.mkdirSync(path.dirname(outboxFile), { recursive: true });
  const current = fs.existsSync(outboxFile) ? fs.readFileSync(outboxFile, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(
    outboxFile,
    `${separator}${JSON.stringify({ createdAt: new Date().toISOString(), ...entry })}\n`,
    "utf8"
  );
  return { mode: "development-outbox" };
}

async function sendHtmlWithGmail({ to, subject, html }) {
  const { ReplitConnectors } = require("@replit/connectors-sdk");
  const connectors = new ReplitConnectors();
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

async function sendHtmlWithSendGrid({ to, subject, html, from }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured");
  const mailFrom = from || process.env.MAIL_FROM || "noreply@maw3ed.local";
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: mailFrom, name: process.env.MAIL_FROM_NAME || "موعد Maw3ed" },
      subject,
      content: [{ type: "text/html", value: html }]
    })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SendGrid send failed with status ${response.status}: ${errorBody.slice(0, 200)}`);
  }
  return { mode: "sendgrid", sender: mailFrom };
}

async function deliverHtmlEmail({ to, subject, html, type = "generic" }) {
  if (!to) return { mode: "skipped", reason: "missing-to" };
  if (process.env.MAW3ED_EMAIL_MODE === "outbox") {
    return appendOutbox({ to, subject, type, mode: "development" });
  }
  if (process.env.SENDGRID_API_KEY) {
    return sendHtmlWithSendGrid({ to, subject, html });
  }
  try {
    return await sendHtmlWithGmail({ to, subject, html });
  } catch (error) {
    console.warn("[email] live send failed, writing outbox fallback:", error.message);
    return appendOutbox({ to, subject, type, mode: "fallback-outbox", error: error.message });
  }
}

async function sendWithGmail({ email, code, locale }) {
  const direction = locale === "ar" ? "rtl" : "ltr";
  const brand = locale === "ar" ? "موعد" : "Maw3ed";
  const subject = locale === "ar" ? "رمز التحقق من بريدك — موعد" : "Your Maw3ed verification code";
  const html = `<div style="font-family:Arial,sans-serif;direction:${direction}"><h2 style="color:#0b369c">${brand}</h2><p>${locale === "ar" ? "رمز التحقق الخاص بك هو:" : "Your verification code is:"}</p><strong style="font-size:28px;letter-spacing:6px">${code}</strong><p>${locale === "ar" ? "ينتهي الرمز خلال 10 دقائق." : "This code expires in 10 minutes."}</p><hr><small>UpNexa-eg.com · ${brand}</small></div>`;
  return deliverHtmlEmail({ to: email, subject, html, type: "verification" });
}

async function sendVerificationEmail({ email, code, locale }) {
  return sendWithGmail({ email, code, locale });
}

async function sendSubscriptionRequestEmail({ user, workspace, plan }) {
  const direction = workspace.locale === "ar" ? "rtl" : "ltr";
  const subject = `طلب اشتراك ${plan.display_name} — ${workspace.name}`;
  const html = `<div style="font-family:Arial,sans-serif;direction:${direction}"><h2 style="color:#0b369c">طلب اشتراك جديد في موعد Maw3ed</h2><p><strong>المؤسسة:</strong> ${workspace.name}</p><p><strong>النشاط:</strong> ${workspace.activity_type}</p><p><strong>البريد:</strong> ${user.email}</p><p><strong>الخطة:</strong> ${plan.display_name}</p><p><strong>السعر المقترح:</strong> ${plan.price_usd} USD / ${plan.billing_period_days} يوم</p><p>الطلب معلّق وينتظر موافقة مسؤول المنصة من لوحة الإدارة.</p><hr><small>UpNexa-eg.com · موعد Maw3ed</small></div>`;
  if (process.env.MAW3ED_EMAIL_MODE === "outbox") {
    return appendOutbox({
      type: "subscription-request",
      workspace: workspace.name,
      plan: plan.plan_key,
      mode: "development"
    });
  }
  return deliverHtmlEmail({ to: process.env.MAIL_FROM || user.email, subject, html, type: "subscription-request" });
}

async function sendBookingConfirmationEmail({
  to,
  businessTo = "",
  appointment,
  page = {},
  locale = "ar"
}) {
  if (!to && !businessTo) return { mode: "skipped", reason: "no-recipients" };
  const direction = locale === "ar" ? "rtl" : "ltr";
  const brand = page.businessName || (locale === "ar" ? "موعد" : "Maw3ed");
  const subject =
    locale === "ar"
      ? `تأكيد حجزك — ${appointment.serviceName || "موعد"} · ${brand}`
      : `Booking confirmed — ${appointment.serviceName || "Appointment"} · ${brand}`;
  const html = `<div style="font-family:Arial,sans-serif;direction:${direction};max-width:560px">
  <h2 style="color:#0b369c;margin-bottom:8px">${brand}</h2>
  <p>${locale === "ar" ? "تم تأكيد حجزك بنجاح." : "Your booking is confirmed."}</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:6px 0;color:#64748b">${locale === "ar" ? "الخدمة" : "Service"}</td><td style="padding:6px 0"><strong>${appointment.serviceName || ""}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#64748b">${locale === "ar" ? "الموظف" : "Staff"}</td><td style="padding:6px 0">${appointment.staffName || ""}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">${locale === "ar" ? "التاريخ" : "Date"}</td><td style="padding:6px 0">${appointment.date || ""}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">${locale === "ar" ? "الوقت" : "Time"}</td><td style="padding:6px 0">${appointment.time || ""}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">${locale === "ar" ? "الحالة" : "Status"}</td><td style="padding:6px 0">${appointment.status || ""}</td></tr>
  </table>
  ${appointment.notes ? `<p style="color:#475569">${locale === "ar" ? "ملاحظات:" : "Notes:"} ${appointment.notes}</p>` : ""}
  <hr><small>UpNexa-eg.com · موعد Maw3ed</small>
</div>`;

  const results = [];
  if (to) {
    results.push(await deliverHtmlEmail({ to, subject, html, type: "booking-confirmation" }));
  }
  if (businessTo && businessTo !== to) {
    const businessSubject =
      locale === "ar" ? `حجز جديد — ${appointment.customerName || ""} · ${brand}` : `New booking — ${appointment.customerName || ""} · ${brand}`;
    results.push(
      await deliverHtmlEmail({
        to: businessTo,
        subject: businessSubject,
        html,
        type: "booking-confirmation-business"
      })
    );
  }
  return { mode: "booking-confirmation", results };
}

module.exports = {
  sendVerificationEmail,
  sendSubscriptionRequestEmail,
  sendBookingConfirmationEmail,
  deliverHtmlEmail
};
