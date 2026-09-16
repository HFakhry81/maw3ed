import React, { useEffect, useState } from "react";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignIn,
  SignUp,
  UserButton,
  useAuth,
  useUser,
  useClerk
} from "@clerk/clerk-react";
import { bindClerkTokenGetter, clearClerkTokenGetter } from "./clerkAuth";
import { api } from "./api";

const envPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.CLERK_PUBLISHABLE_KEY ||
  "";

const SESSION_KEYS = ["maw3ed.role", "maw3ed.workspaceId", "maw3ed.industrySeen"];
const FRESH_TRIAL_FLAG = "maw3ed.clerkTrialFresh";
const FRESH_TRIAL_VALUE = "2026-09-16";

const clerkAppearance = {
  variables: {
    colorPrimary: "#1769e8",
    colorText: "#071942",
    colorBackground: "#ffffff",
    borderRadius: "12px"
  },
  elements: {
    rootBox: { width: "100%" },
    card: { boxShadow: "none", border: "0", width: "100%" },
    headerTitle: { color: "#071942" },
    formButtonPrimary: {
      background: "#1769e8",
      "&:hover": { background: "#0b369c" }
    }
  }
};

export function clearLocalAppSession() {
  SESSION_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });
  api.setWorkspaceId("");
}

export function Maw3edClerkProvider({ publishableKey, children }) {
  if (!publishableKey) return children;
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/?onboarding=1"
      appearance={clerkAppearance}
    >
      {children}
    </ClerkProvider>
  );
}

export function ClerkTokenBridge({ children }) {
  const { isLoaded, getToken } = useAuth();
  useEffect(() => {
    if (!isLoaded) return undefined;
    bindClerkTokenGetter(() => getToken());
    return () => clearClerkTokenGetter();
  }, [isLoaded, getToken]);
  return children;
}

/** Clear stale local demo keys once — never sign the user out after signup/verify. */
export function FreshTrialGate({ children }) {
  useEffect(() => {
    try {
      if (localStorage.getItem(FRESH_TRIAL_FLAG) === FRESH_TRIAL_VALUE) return;
      clearLocalAppSession();
      localStorage.setItem(FRESH_TRIAL_FLAG, FRESH_TRIAL_VALUE);
    } catch {
      /* ignore */
    }
  }, []);
  return children;
}

function initialAuthMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "sign-up" || params.get("onboarding") === "1") return "sign-up";
    if (window.location.hash.includes("sign-up")) return "sign-up";
  } catch {
    /* ignore */
  }
  return "sign-in";
}

export function AuthLanding() {
  const [mode, setMode] = useState(initialAuthMode);

  return (
    <div className="auth-landing">
      <div className="auth-landing-card auth-landing-card-wide">
        <img className="auth-brand-logo" src="/assets/maw3ed-icon.svg" alt="موعد" width={112} height={112} />
        <h1>موعد Maw3ed</h1>
        <p>سجّل بالبريد وكلمة المرور، أكّد بريدك، ثم ادخل إلى لوحة التحكم.</p>
        <div className="auth-mode-switch" role="tablist" aria-label="وضع الحساب">
          <button
            type="button"
            className={mode === "sign-up" ? "active" : ""}
            onClick={() => setMode("sign-up")}
          >
            إنشاء حساب
          </button>
          <button
            type="button"
            className={mode === "sign-in" ? "active" : ""}
            onClick={() => setMode("sign-in")}
          >
            تسجيل الدخول
          </button>
        </div>
        <div className="auth-clerk-host">
          {mode === "sign-up" ? (
            <SignUp
              routing="hash"
              signInUrl="/#/sign-in"
              forceRedirectUrl="/?onboarding=1"
              fallbackRedirectUrl="/?onboarding=1"
              appearance={clerkAppearance}
            />
          ) : (
            <SignIn
              routing="hash"
              signUpUrl="/#/sign-up"
              forceRedirectUrl="/"
              fallbackRedirectUrl="/"
              appearance={clerkAppearance}
            />
          )}
        </div>
        <a className="auth-fallback-link" href="/auth.html?mode=sign-up">
          فتح صفحة التسجيل الكاملة
        </a>
        <small>
          بعد التحقق من البريد يمكنك تغيير كلمة المرور من قائمة الحساب (أيقونة المستخدم) → Security.
        </small>
      </div>
    </div>
  );
}

export function AuthControls({ onSignOut }) {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || "";
  const name = user?.fullName || user?.firstName || email || "مستخدم موعد";

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      /* ignore */
    }
    clearLocalAppSession();
    if (typeof onSignOut === "function") onSignOut();
    else window.location.href = "/";
  };

  return (
    <div className="auth-controls">
      <div className="user-chip">
        <b>{name}</b>
        <span>{email || "حساب Clerk"}</span>
      </div>
      <UserButton afterSignOutUrl="/" />
      <button type="button" className="ghost-button auth-profile-btn" onClick={() => openUserProfile()}>
        الأمان وكلمة المرور
      </button>
      <button type="button" className="logout-button" onClick={handleSignOut}>
        تسجيل الخروج
      </button>
    </div>
  );
}

export function WorkspaceOnboarding({ onCreated }) {
  const { user } = useUser();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [activityType, setActivityType] = useState("medical");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const base = (user?.fullName || user?.firstName || "مساحة موعد").trim();
    setName((current) => current || base);
    setSlug(
      (current) =>
        current ||
        base
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "") ||
        `ws-${Date.now()}`
    );
  }, [user]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.post("/api/workspaces", {
        name: name.trim(),
        slug:
          (slug || name).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") ||
          `ws-${Date.now()}`,
        activityType
      });
      const id = result.workspace?.id;
      if (id) {
        api.setWorkspaceId(id);
        if (typeof onCreated === "function") onCreated(result.workspace);
      }
    } catch (err) {
      setError(err.message || "تعذر إنشاء مساحة العمل");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-landing">
      <form className="auth-landing-card onboarding-card" onSubmit={submit}>
        <img className="auth-brand-logo" src="/assets/maw3ed-icon.svg" alt="موعد" width={112} height={112} />
        <h1>أنشئ مساحة عملك</h1>
        <p>تم التحقق من حسابك. الخطوة التالية: بناء مساحة عمل للمنشأة.</p>
        <label>
          اسم المساحة
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="عيادة النور" />
        </label>
        <label>
          الرابط (slug)
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="al-noor-clinic"
            pattern="[a-z0-9-]{3,60}"
          />
        </label>
        <label>
          نوع النشاط
          <select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
            <option value="medical">طبي</option>
            <option value="salon">صالون</option>
            <option value="education">تعليمي</option>
            <option value="fitness">رياضي</option>
            <option value="other">أخرى</option>
          </select>
        </label>
        {error && <div className="error-banner">{error}</div>}
        <button className="primary-button auth-cta" type="submit" disabled={busy}>
          {busy ? "جارٍ الإنشاء…" : "إنشاء مساحة العمل"}
        </button>
      </form>
    </div>
  );
}

export function useClerkPublishableKey() {
  const [key, setKey] = useState(envPublishableKey);
  const [ready, setReady] = useState(Boolean(envPublishableKey));

  useEffect(() => {
    if (envPublishableKey) return undefined;
    let cancelled = false;
    api
      .get("/api/config")
      .then((config) => {
        if (!cancelled && config.clerkPublishableKey) setKey(config.clerkPublishableKey);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { key, ready };
}

export { SignedIn, SignedOut, SignIn, SignUp, useAuth, useUser, envPublishableKey };
