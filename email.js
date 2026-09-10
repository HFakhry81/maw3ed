const fs = require("fs");
const path = require("path");

const outboxFile = path.join(__dirname, "data", "email-outbox.jsonl");

async function sendVerificationEmail({ email, code, locale }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (apiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: locale === "ar" ? "رمز التحقق من بريدك — موعد" : "Your Maw3ed verification code",
        html: `<div style="font-family:Arial,sans-serif;direction:${locale === "ar" ? "rtl" : "ltr"}"><h2>Maw3ed</h2><p>${locale === "ar" ? "رمز التحقق الخاص بك هو:" : "Your verification code is:"}</p><strong style="font-size:28px;letter-spacing:6px">${code}</strong><p>${locale === "ar" ? "ينتهي الرمز خلال 10 دقائق." : "This code expires in 10 minutes."}</p></div>`
      })
    });
    if (!response.ok) throw new Error(`Email provider failed with status ${response.status}`);
    return { mode: "resend" };
  }

  fs.mkdirSync(path.dirname(outboxFile), { recursive: true });
  const current = fs.existsSync(outboxFile) ? fs.readFileSync(outboxFile, "utf8") : "";
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(outboxFile, `${separator}${JSON.stringify({ createdAt: new Date().toISOString(), to: email, code, type: "verification", mode: "development" })}\n`, "utf8");
  return { mode: "development-outbox" };
}

module.exports = { sendVerificationEmail };