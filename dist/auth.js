function clerkFrontendApiHost(publishableKey) {
  const encoded = String(publishableKey || "").replace(/^pk_(?:test|live)_/, "");
  if (!encoded) throw new Error("Invalid Clerk publishable key");
  const decoded = atob(encoded);
  return decoded.replace(/\$$/, "");
}

function clerkBrowserScriptUrl(publishableKey) {
  const host = clerkFrontendApiHost(publishableKey);
  return `https://${host}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
}

function waitForClerkGlobal(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (window.Clerk) return resolve(window.Clerk);
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("Clerk global did not become available"));
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function loadClerkInstance(publishableKey) {
  if (window.Clerk?.version || window.Clerk?.mountSignUp) {
    if (typeof window.Clerk.load === "function") await window.Clerk.load();
    return window.Clerk;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = clerkBrowserScriptUrl(publishableKey);
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-clerk-publishable-key", publishableKey);
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Clerk browser script from Clerk Frontend API"));
    document.head.appendChild(script);
  });

  const ClerkGlobal = await waitForClerkGlobal();
  if (typeof ClerkGlobal === "function") {
    const instance = new ClerkGlobal(publishableKey);
    await instance.load();
    return instance;
  }
  if (typeof ClerkGlobal.load === "function") await ClerkGlobal.load();
  return ClerkGlobal;
}

function setTrialFlag() {
  try {
    localStorage.setItem("maw3ed.clerkTrialFresh", "2026-09-16");
  } catch {
    /* ignore */
  }
}

function redirectAfterAuth(isSignUp) {
  setTrialFlag();
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.replace(next || (isSignUp ? "/?onboarding=1" : "/"));
}

(async () => {
  const container = document.getElementById("clerk-auth");
  if (!container) return;
  try {
    const config = await fetch("/api/config", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`config HTTP ${response.status}`);
      return response.json();
    });
    const publishableKey = config.clerkPublishableKey;
    if (!publishableKey) throw new Error("Clerk publishable key missing from /api/config");

    const clerk = await loadClerkInstance(publishableKey);
    if (!clerk?.mountSignUp || !clerk?.mountSignIn) {
      throw new Error("Clerk UI components are unavailable");
    }

    if (clerk.user) {
      redirectAfterAuth(new URLSearchParams(window.location.search).get("mode") === "sign-up");
      return;
    }

    const isSignUp = new URLSearchParams(window.location.search).get("mode") === "sign-up";
    const appearance = {
      variables: {
        colorPrimary: "#1769e8",
        colorText: "#071942",
        colorBackground: "#ffffff",
        borderRadius: "12px"
      },
      elements: {
        card: { boxShadow: "none" },
        headerTitle: { color: "#071942" }
      }
    };

    container.className = "";
    container.textContent = "";

    if (isSignUp) {
      clerk.mountSignUp(container, {
        appearance,
        routing: "hash",
        forceRedirectUrl: "/?onboarding=1",
        fallbackRedirectUrl: "/?onboarding=1",
        signInUrl: "/auth.html"
      });
    } else {
      clerk.mountSignIn(container, {
        appearance,
        routing: "hash",
        forceRedirectUrl: "/",
        fallbackRedirectUrl: "/",
        signUpUrl: "/auth.html?mode=sign-up"
      });
    }

    if (typeof clerk.addListener === "function") {
      clerk.addListener(({ user }) => {
        if (user) redirectAfterAuth(isSignUp);
      });
    }
  } catch (error) {
    container.className = "loading";
    container.replaceChildren();
    const title = document.createElement("div");
    title.textContent = "تعذر تجهيز تسجيل الدخول. تأكد من إعداد Clerk ثم أعد المحاولة.";
    const detail = document.createElement("small");
    detail.style.display = "block";
    detail.style.marginTop = "12px";
    detail.style.color = "#9b1c1c";
    detail.textContent = error?.message || String(error);
    container.append(title, detail);
    console.error("[maw3ed-auth]", error);
  }
})();
