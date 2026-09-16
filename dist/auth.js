async function loadClerkScript() {
  if (window.Clerk) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

(async () => {
  const container = document.getElementById("clerk-auth");
  try {
    const config = await fetch("/api/config").then((response) => response.json());
    if (!config.clerkPublishableKey) throw new Error("Clerk is not configured");
    await loadClerkScript();
    const clerk = new window.Clerk(config.clerkPublishableKey);
    await clerk.load();
    if (clerk.user) {
      try {
        localStorage.setItem("maw3ed.clerkTrialFresh", "2026-09-16");
      } catch {
        /* ignore */
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/?onboarding=1";
      window.location.href = next;
      return;
    }
    const isSignUp = new URLSearchParams(window.location.search).get("mode") === "sign-up";
    const options = {
      appearance: {
        variables: { colorPrimary: "#1769e8", colorText: "#071942", colorBackground: "#ffffff", borderRadius: "12px" },
        elements: { card: "shadow-none", headerTitle: "text-[#071942]", formButtonPrimary: "bg-[#1769e8] hover:bg-[#0b369c]" }
      }
    };
    if (isSignUp) {
      clerk.mountSignUp(container, {
        ...options,
        routing: "hash",
        forceRedirectUrl: "/?onboarding=1"
      });
    } else {
      clerk.mountSignIn(container, {
        ...options,
        routing: "hash",
        forceRedirectUrl: "/"
      });
    }
  } catch (error) {
    container.className = "loading";
    container.textContent = "تعذر تجهيز تسجيل الدخول. تأكد من إعداد Clerk ثم أعد المحاولة.";
    console.error(error);
  }
})();