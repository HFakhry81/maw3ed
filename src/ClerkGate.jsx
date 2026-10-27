import React, { useEffect, useRef, useState } from "react";
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
import { applyDocumentLocale } from "./i18n";
import { getAuthCopy, getAuthLocales } from "./authI18n";
import { KeyboardSpacer } from "./useKeyboardInset.jsx";
import { clearLocalWorkspaceOptIn } from "./workspaceSelection";

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
  clearLocalWorkspaceOptIn();
  api.setWorkspaceId("");
}

export function Maw3edClerkProvider({ publishableKey, localization, children }) {
  if (!publishableKey) return children;
  return (
    <ClerkProvider
      key={localization?.locale || "default"}
      publishableKey={publishableKey}
      localization={localization}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/?onboarding=1"
      signUpFallbackRedirectUrl="/?onboarding=1"
      appearance={clerkAppearance}
    >
      {children}
    </ClerkProvider>
  );
}

export function ClerkTokenBridge({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [ready, setReady] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      setReady(false);
      setTokenReady(false);
      return undefined;
    }

    bindClerkTokenGetter(async (options) => {
      const token = await getToken(options);
      return token;
    });
    setReady(true);

    let cancelled = false;
    (async () => {
      if (!isSignedIn) {
        if (!cancelled) setTokenReady(false);
        return;
      }
      for (let attempt = 0; attempt < 12; attempt += 1) {
        try {
          const token = await getToken(attempt === 0 ? undefined : { skipCache: true });
          if (token) {
            if (!cancelled) setTokenReady(true);
            return;
          }
        } catch {
          /* session still warming up */
        }
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
      if (!cancelled) setTokenReady(false);
    })();

    return () => {
      cancelled = true;
      clearClerkTokenGetter();
      setReady(false);
      setTokenReady(false);
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded || !ready) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <p>جارٍ تجهيز جلسة الدخول…</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <p>انتهت الجلسة. سجّل الدخول مرة أخرى للمتابعة.</p>
        </div>
      </div>
    );
  }

  if (!tokenReady) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <p>جارٍ تجهيز رمز الدخول الآمن…</p>
        </div>
      </div>
    );
  }

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

export function AuthLanding({ locale = "ar", onLocaleChange }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [mode, setMode] = useState(initialAuthMode);
  const copy = getAuthCopy(locale);
  const locales = getAuthLocales();

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return undefined;
    const wantsOnboarding =
      new URLSearchParams(window.location.search).get("onboarding") === "1" ||
      new URLSearchParams(window.location.search).get("mode") === "sign-up";
    window.location.replace(wantsOnboarding ? "/?onboarding=1" : "/");
    return undefined;
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <p>{copy.checking}</p>
        </div>
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <p>{copy.alreadyIn}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-landing">
      <div className="auth-landing-card auth-landing-card-wide">
        <img className="auth-brand-logo" src="/assets/maw3ed-icon.svg" alt="موعد" width={112} height={112} />
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <label className="auth-locale-select">
          <span>Language / اللغة</span>
          <select
            value={locale}
            onChange={(e) => {
              const next = e.target.value;
              try {
                localStorage.setItem("maw3ed.locale", next);
              } catch {
                /* ignore */
              }
              if (typeof onLocaleChange === "function") onLocaleChange(next);
            }}
          >
            {locales.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="password-rules-banner" role="note">
          <strong>{copy.password}</strong>
          <p>{copy.passwordHint}</p>
          <ul>
            <li>8+</li>
            <li>123</li>
            <li>!@#</li>
          </ul>
        </div>
        <div className="auth-mode-switch" role="tablist" aria-label={copy.signUp}>
          <button
            type="button"
            className={mode === "sign-up" ? "active" : ""}
            onClick={() => setMode("sign-up")}
          >
            {copy.signUp}
          </button>
          <button
            type="button"
            className={mode === "sign-in" ? "active" : ""}
            onClick={() => setMode("sign-in")}
          >
            {copy.signIn}
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
              forceRedirectUrl="/?onboarding=1"
              fallbackRedirectUrl="/?onboarding=1"
              appearance={clerkAppearance}
              // Password sign-in only. OTP is signup/email-change via Clerk Dashboard — see docs/CLERK_OTP.md
              withSignUp={false}
            />
          )}
        </div>
        <a className="auth-fallback-link" href={`/auth.html?mode=sign-up&lang=${encodeURIComponent(locale)}`}>
          {copy.fullPage}
        </a>
        <small>{mode === "sign-up" ? copy.afterVerify : copy.signInHint || copy.afterVerify}</small>
        <KeyboardSpacer />
      </div>
    </div>
  );
}

/** Explicit session gate — avoids SignedIn/SignedOut flicker loops after signup. */
export function AuthSessionGate({ locale, onLocaleChange, children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const copy = getAuthCopy(locale);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setSlow(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <div className="auth-landing">
        <div className="auth-landing-card">
          <p>{copy.checking}</p>
          {slow ? (
            <>
              <p className="muted">يستغرق التحميل وقتاً أطول من المعتاد. جرّب إعادة التحميل أو التحقق من الاتصال.</p>
              <button type="button" className="primary-button auth-cta" onClick={() => window.location.reload()}>
                إعادة تحميل الصفحة
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <AuthLanding locale={locale} onLocaleChange={onLocaleChange} />;
  }
  return children;
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
  const [slugTouched, setSlugTouched] = useState(false);
  const [activityType, setActivityType] = useState("medical");
  const [lockAck, setLockAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slugConflict, setSlugConflict] = useState(null);
  const slugInputRef = useRef(null);

  const normalizeSlug = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

  const withSuffix = (base) => {
    const clean = normalizeSlug(base) || "workspace";
    const match = clean.match(/^(.*)-(\d+)$/);
    if (match) {
      const next = Number(match[2]) + 1;
      const tag = `-${next}`;
      return `${match[1].slice(0, Math.max(3, 60 - tag.length))}${tag}`;
    }
    const tag = "-2";
    return `${clean.slice(0, Math.max(3, 60 - tag.length))}${tag}`;
  };

  useEffect(() => {
    const base = (user?.fullName || user?.firstName || "").trim();
    if (base) setName((current) => current || base);
  }, [user]);

  useEffect(() => {
    if (slugTouched) return;
    const fromName = normalizeSlug(name);
    setSlug(fromName || `ws-${Date.now().toString(36)}`);
  }, [name, slugTouched]);

  const applySuggestedSlug = (suggested) => {
    const next = normalizeSlug(suggested) || withSuffix(slug || name);
    setSlugTouched(true);
    setSlug(next);
    setSlugConflict(null);
    setError("");
    window.setTimeout(() => slugInputRef.current?.focus(), 0);
    return next;
  };

  const submit = async (event, options = {}) => {
    event?.preventDefault?.();
    if (busy) return;
    if (!lockAck) {
      setError("يجب تأكيد أن نوع النشاط سيُقفل بعد الإنشاء ولا يمكن تغييره من لوحة المنشأة.");
      return;
    }
    setBusy(true);
    setError("");
    if (!options.keepConflict) setSlugConflict(null);
    let nextSlug =
      normalizeSlug(options.slugOverride || slug || name) || `ws-${Date.now().toString(36)}`;
    if (nextSlug.length < 3) nextSlug = `ws-${Date.now().toString(36)}`;
    setSlugTouched(true);
    setSlug(nextSlug);
    try {
      const token = await api.resolveToken();
      if (!token) {
        throw Object.assign(new Error("يلزم تسجيل الدخول من جديد قبل إنشاء مساحة العمل"), { status: 401 });
      }
      const result = await api.post("/api/workspaces", {
        name: name.trim(),
        slug: nextSlug,
        activityType,
        lockActivity: true,
        acceptSuggestedSlug: Boolean(options.acceptSuggestedSlug)
      });
      const id = result.workspace?.id;
      if (result.workspace?.slug) setSlug(result.workspace.slug);
      setSlugConflict(null);
      setError("");
      if (id) {
        api.setWorkspaceId(id);
        if (typeof onCreated === "function") onCreated(result.workspace);
      }
    } catch (err) {
      const suggested = err.suggestedSlug || withSuffix(nextSlug);
      if (err.code === "slug_taken" || /slug_taken|مستخدم بالفعل|workspaces_slug_key|duplicate key/i.test(err.message || "")) {
        setSlugConflict({
          requested: nextSlug,
          suggested
        });
        setError(`الرابط «${nextSlug}» مستخدم بالفعل. عدّله يدوياً أو استخدم المقترح «${suggested}».`);
        window.setTimeout(() => slugInputRef.current?.focus(), 0);
      } else if (/3-60|slug containing|الرابط يجب/i.test(err.message || "")) {
        setError("الرابط يجب أن يكون إنجليزياً صغيراً فقط (a-z و 0-9 و -) بطول 3 إلى 60 حرفاً، بدون / أو مسافات");
      } else {
        setError(err.message || "تعذر إنشاء مساحة العمل");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-landing">
      <form className="auth-landing-card onboarding-card" onSubmit={(e) => submit(e)}>
        <img className="auth-brand-logo" src="/assets/maw3ed-icon.svg" alt="موعد" width={112} height={112} />
        <h1>أنشئ مساحة عملك</h1>
        <p>تم التحقق من حسابك. الخطوة التالية: بناء مساحة عمل للمنشأة.</p>
        <label htmlFor="workspace-name">
          اسم المساحة
          <input id="workspace-name" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="عيادة النور" autoComplete="organization" />
        </label>
        <label htmlFor="workspace-slug">
          الرابط (slug)
          <div className="slug-field-row">
            <input
              ref={slugInputRef}
              id="workspace-slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlugConflict(null);
                setError("");
                setSlug(normalizeSlug(e.target.value));
              }}
              placeholder="dawy-hospitals"
              pattern="[-a-z0-9]{3,60}"
              title="حروف إنجليزية صغيرة وأرقام وشرطة (-) فقط"
              aria-invalid={Boolean(slugConflict)}
            />
            <button
              type="button"
              className="slug-distinguish-btn"
              disabled={busy}
              onClick={() => {
                const suggested = slugConflict?.suggested || withSuffix(slug || name);
                applySuggestedSlug(suggested);
              }}
            >
              أضف تمييزاً
            </button>
          </div>
        </label>
        <small className="slug-hint">مثال صحيح: dawy-hospitals — يُسمح بالشرطة (-) بين الكلمات الإنجليزية</small>
        {slugConflict && (
          <div className="slug-conflict-banner" role="alert">
            <div>
              الرابط <b>{slugConflict.requested}</b> مأخوذ مسبقاً.
              <br />
              المقترح: <code>{slugConflict.suggested}</code>
            </div>
            <div className="slug-conflict-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={busy}
                onClick={() => applySuggestedSlug(slugConflict.suggested)}
              >
                استخدم المقترح
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  const suggested = slugConflict.suggested;
                  setSlug(suggested);
                  setSlugTouched(true);
                  submit(null, { slugOverride: suggested, acceptSuggestedSlug: true, keepConflict: true });
                }}
              >
                أنشئ بالمقترح
              </button>
            </div>
          </div>
        )}
        <label htmlFor="workspace-activity">
          نوع النشاط
          <select
            id="workspace-activity"
            name="activityType"
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            aria-describedby="activity-lock-hint"
          >
            <option value="medical">مركز طبي</option>
            <option value="clinic">عيادة</option>
            <option value="dentist">طبيب أسنان</option>
            <option value="salon">صالون الشعر</option>
            <option value="barber">صالون الحلاقة</option>
            <option value="beauty">التجميل</option>
            <option value="massage">تدليك</option>
            <option value="spa">منتجع صحي</option>
            <option value="consultant">استشاري</option>
            <option value="education">مركز تعليمي</option>
            <option value="school">مدرسة</option>
            <option value="fitness">مركز رياضي</option>
            <option value="carwash">غسيل سيارة</option>
            <option value="events">تنظيم الأحداث</option>
            <option value="pets">رعاية حيوانات أليفة</option>
            <option value="billiards">صالة بلياردو</option>
            <option value="custom">صناعة مخصصة (فارغ)</option>
            <option value="other">نشاط مخصص (فارغ)</option>
          </select>
        </label>
        <p id="activity-lock-hint" className="slug-hint" role="note">
          القالب يهيّئ المصطلحات والكتالوج الأولي فقط. سياسة الحجز والسعة تُضبط لاحقاً على كل خدمة عبر نمط الإشغال — ولا يُعلن التعليم أو الصالون أو التأجير جاهزاً للإنتاج لمجرد اختيار القالب.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={lockAck}
            onChange={(e) => setLockAck(e.target.checked)}
            required
            aria-required="true"
          />
          أؤكّد أن نوع النشاط سيُقفل بعد الإنشاء ولن يظهر تبديل القالب داخل لوحة المنشأة.
        </label>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <button className="primary-button auth-cta" type="submit" disabled={busy || !lockAck}>
          {busy ? "جارٍ الإنشاء…" : "إنشاء مساحة العمل وقفل القالب"}
        </button>
        <KeyboardSpacer />
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
