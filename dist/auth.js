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

function waitForClerkGlobal(timeoutMs = 12000) {
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
  if (window.Clerk?.mountSignUp || window.Clerk?.mountSignIn || typeof window.Clerk?.load === "function") {
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

const AUTH_LOCALES = {
  ar: {
    dir: "rtl",
    title: "تسجيل الدخول — موعد Maw3ed",
    brand: "موعد Maw3ed",
    loading: "جارٍ تجهيز تسجيل الدخول...",
    password: "كلمة المرور",
    passwordHint:
      "كلمة المرور يجب أن تكون 8 أحرف على الأقل، وتحتوي على أرقام ورموز (مثل ! @ # $ %).",
    formFieldLabel__password: "كلمة المرور",
    formFieldLabel__confirmPassword: "تأكيد كلمة المرور"
  },
  en: {
    dir: "ltr",
    title: "Sign in — Maw3ed",
    brand: "Maw3ed",
    loading: "Preparing sign-in…",
    password: "Password",
    passwordHint:
      "Password must be at least 8 characters and include numbers and symbols (e.g. ! @ # $ %).",
    formFieldLabel__password: "Password",
    formFieldLabel__confirmPassword: "Confirm password"
  },
  fr: {
    dir: "ltr",
    title: "Connexion — Maw3ed",
    brand: "Maw3ed",
    loading: "Préparation de la connexion…",
    password: "Mot de passe",
    passwordHint:
      "Le mot de passe doit contenir au moins 8 caractères, avec des chiffres et des symboles (ex. ! @ # $ %).",
    formFieldLabel__password: "Mot de passe",
    formFieldLabel__confirmPassword: "Confirmer le mot de passe"
  },
  ur: {
    dir: "rtl",
    title: "سائن اِن — موعد Maw3ed",
    brand: "موعد Maw3ed",
    loading: "سائن اِن تیار ہو رہا ہے…",
    password: "پاس ورڈ",
    passwordHint: "پاس ورڈ کم از کم 8 حروف کا ہو، اور اس میں اعداد اور علامات (! @ # $ %) شامل ہوں۔",
    formFieldLabel__password: "پاس ورڈ",
    formFieldLabel__confirmPassword: "پاس ورڈ کی تصدیق"
  },
  tr: {
    dir: "ltr",
    title: "Giriş — Maw3ed",
    brand: "Maw3ed",
    loading: "Giriş hazırlanıyor…",
    password: "Şifre",
    passwordHint: "Şifre en az 8 karakter olmalı; rakam ve sembol içermelidir (örn. ! @ # $ %).",
    formFieldLabel__password: "Şifre",
    formFieldLabel__confirmPassword: "Şifreyi onayla"
  },
  es: {
    dir: "ltr",
    title: "Inicio de sesión — Maw3ed",
    brand: "Maw3ed",
    loading: "Preparando el inicio de sesión…",
    password: "Contraseña",
    passwordHint:
      "La contraseña debe tener al menos 8 caracteres e incluir números y símbolos (p. ej. ! @ # $ %).",
    formFieldLabel__password: "Contraseña",
    formFieldLabel__confirmPassword: "Confirmar contraseña"
  },
  hi: {
    dir: "ltr",
    title: "साइन इन — Maw3ed",
    brand: "Maw3ed",
    loading: "साइन-इन तैयार हो रहा है…",
    password: "पासवर्ड",
    passwordHint: "पासवर्ड कम से कम 8 अक्षर का हो और इसमें अंक तथा प्रतीक (! @ # $ %) हों।",
    formFieldLabel__password: "पासवर्ड",
    formFieldLabel__confirmPassword: "पासवर्ड की पुष्टि"
  },
  bn: {
    dir: "ltr",
    title: "সাইন ইন — Maw3ed",
    brand: "Maw3ed",
    loading: "সাইন-ইন প্রস্তুত হচ্ছে…",
    password: "পাসওয়ার্ড",
    passwordHint: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে এবং এতে সংখ্যা ও প্রতীক (! @ # $ %) থাকতে হবে।",
    formFieldLabel__password: "পাসওয়ার্ড",
    formFieldLabel__confirmPassword: "পাসওয়ার্ড নিশ্চিত করুন"
  },
  de: {
    dir: "ltr",
    title: "Anmelden — Maw3ed",
    brand: "Maw3ed",
    loading: "Anmeldung wird vorbereitet…",
    password: "Passwort",
    passwordHint:
      "Das Passwort muss mindestens 8 Zeichen haben und Zahlen sowie Symbole enthalten (z. B. ! @ # $ %).",
    formFieldLabel__password: "Passwort",
    formFieldLabel__confirmPassword: "Passwort bestätigen"
  },
  pt: {
    dir: "ltr",
    title: "Entrar — Maw3ed",
    brand: "Maw3ed",
    loading: "A preparar o início de sessão…",
    password: "Palavra-passe",
    passwordHint:
      "A palavra-passe deve ter pelo menos 8 caracteres e incluir números e símbolos (ex. ! @ # $ %).",
    formFieldLabel__password: "Palavra-passe",
    formFieldLabel__confirmPassword: "Confirmar palavra-passe"
  },
  ru: {
    dir: "ltr",
    title: "Вход — Maw3ed",
    brand: "Maw3ed",
    loading: "Подготовка входа…",
    password: "Пароль",
    passwordHint:
      "Пароль должен быть не короче 8 символов и содержать цифры и спецсимволы (например ! @ # $ %).",
    formFieldLabel__password: "Пароль",
    formFieldLabel__confirmPassword: "Подтвердите пароль"
  },
  zh: {
    dir: "ltr",
    title: "登录 — Maw3ed",
    brand: "Maw3ed",
    loading: "正在准备登录…",
    password: "密码",
    passwordHint: "密码至少 8 个字符，且需包含数字和符号（例如 ! @ # $ %）。",
    formFieldLabel__password: "密码",
    formFieldLabel__confirmPassword: "确认密码"
  },
  ja: {
    dir: "ltr",
    title: "サインイン — Maw3ed",
    brand: "Maw3ed",
    loading: "サインインを準備しています…",
    password: "パスワード",
    passwordHint: "パスワードは8文字以上で、数字と記号（例: ! @ # $ %）を含めてください。",
    formFieldLabel__password: "パスワード",
    formFieldLabel__confirmPassword: "パスワード確認"
  },
  ko: {
    dir: "ltr",
    title: "로그인 — Maw3ed",
    brand: "Maw3ed",
    loading: "로그인 준비 중…",
    password: "비밀번호",
    passwordHint: "비밀번호는 8자 이상이어야 하며 숫자와 기호(! @ # $ % 등)를 포함해야 합니다.",
    formFieldLabel__password: "비밀번호",
    formFieldLabel__confirmPassword: "비밀번호 확인"
  },
  id: {
    dir: "ltr",
    title: "Masuk — Maw3ed",
    brand: "Maw3ed",
    loading: "Menyiapkan masuk…",
    password: "Kata sandi",
    passwordHint: "Kata sandi minimal 8 karakter dan harus berisi angka serta simbol (mis. ! @ # $ %).",
    formFieldLabel__password: "Kata sandi",
    formFieldLabel__confirmPassword: "Konfirmasi kata sandi"
  }
};

function resolveAuthLocale() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("lang") || params.get("locale");
  let fromStore = "";
  try {
    fromStore = localStorage.getItem("maw3ed.locale") || "";
  } catch {
    /* ignore */
  }
  const code = fromQuery || fromStore || "ar";
  return AUTH_LOCALES[code] ? code : "en";
}

function applyAuthLocale(code) {
  const copy = AUTH_LOCALES[code] || AUTH_LOCALES.en;
  document.documentElement.lang = code;
  document.documentElement.dir = copy.dir;
  document.title = copy.title;
  const brand = document.getElementById("auth-brand-title");
  if (brand) brand.textContent = copy.brand;
  const loading = document.getElementById("clerk-auth");
  if (loading?.classList.contains("loading")) loading.textContent = copy.loading;

  const rules = document.getElementById("password-rules");
  if (rules) {
    rules.hidden = false;
    rules.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = copy.password;
    const hint = document.createElement("div");
    hint.textContent = copy.passwordHint;
    const list = document.createElement("ul");
    ["8+", "123", "!@#"].forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    rules.append(title, hint, list);
  }

  return copy;
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
  window.location.replace(next || "/?onboarding=1");
}

(async () => {
  const localeCode = resolveAuthLocale();
  const copy = applyAuthLocale(localeCode);
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

    // Already signed in → never stay on auth.html (this was feeding the login loop).
    if (clerk.user || clerk.session) {
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
    const localization = {
      formFieldLabel__password: copy.formFieldLabel__password,
      formFieldLabel__confirmPassword: copy.formFieldLabel__confirmPassword,
      unstable__errors: {
        form_password_length_too_short: copy.passwordHint,
        form_password_no_number: copy.passwordHint,
        form_password_no_special_char: copy.passwordHint,
        passwordComplexity: {
          sentencePrefix: copy.passwordHint,
          minimumLength: copy.passwordHint,
          requireNumbers: copy.passwordHint,
          requireSpecialCharacter: copy.passwordHint
        }
      }
    };

    container.className = "";
    container.textContent = "";

    if (isSignUp) {
      clerk.mountSignUp(container, {
        appearance,
        localization,
        routing: "hash",
        forceRedirectUrl: "/?onboarding=1",
        fallbackRedirectUrl: "/?onboarding=1",
        signInUrl: "/auth.html"
      });
    } else {
      clerk.mountSignIn(container, {
        appearance,
        localization,
        routing: "hash",
        forceRedirectUrl: "/?onboarding=1",
        fallbackRedirectUrl: "/?onboarding=1",
        signUpUrl: "/auth.html?mode=sign-up"
      });
    }

    if (typeof clerk.addListener === "function") {
      clerk.addListener(({ user, session }) => {
        if (user || session) redirectAfterAuth(isSignUp);
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
    const home = document.createElement("a");
    home.href = "/?onboarding=1";
    home.textContent = "الانتقال إلى التطبيق مباشرة";
    home.style.display = "inline-block";
    home.style.marginTop = "14px";
    home.style.color = "#246bd2";
    container.append(title, detail, home);
    console.error("[maw3ed-auth]", error);
  }
})();
