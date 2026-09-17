import { LOCALES } from "./i18n";

/** Password rules shown to users and enforced in helper copy. */
export const PASSWORD_RULES = {
  minLength: 8,
  requireNumber: true,
  requireSymbol: true
};

const AUTH_COPY = {
  ar: {
    title: "موعد Maw3ed",
    subtitle: "سجّل بالبريد وكلمة المرور، أكّد بريدك، ثم ادخل إلى لوحة التحكم.",
    signUp: "إنشاء حساب",
    signIn: "تسجيل الدخول",
    fullPage: "فتح صفحة التسجيل الكاملة",
    afterVerify: "التحقق من البريد مرة واحدة عند إنشاء الحساب، ومرة أخرى فقط عند تغيير البريد. تسجيل الدخول بعد ذلك بالبريد وكلمة المرور دون رمز OTP.",
    signInHint: "تسجيل الدخول بالبريد وكلمة المرور فقط — بدون رمز تحقق في كل مرة.",
    checking: "جارٍ التحقق من حالة الدخول…",
    alreadyIn: "أنت مسجّل الدخول بالفعل. جارٍ فتح مساحة العمل…",
    password: "كلمة المرور",
    confirmPassword: "تأكيد كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    confirmPasswordPlaceholder: "أعد إدخال كلمة المرور",
    passwordHint:
      "كلمة المرور يجب أن تكون 8 أحرف على الأقل، وتحتوي على أرقام ورموز (مثل ! @ # $ %).",
    matchingPasswords: "كلمتا المرور متطابقتان.",
    notMatchingPasswords: "كلمتا المرور غير متطابقتين.",
    continue: "متابعة",
    emailAddress: "البريد الإلكتروني"
  },
  en: {
    title: "Maw3ed",
    subtitle: "Sign up with email and password, verify your email, then open your workspace.",
    signUp: "Create account",
    signIn: "Sign in",
    fullPage: "Open the full registration page",
    afterVerify: "Email verification happens once at signup, and again only if you change your email. Later sign-ins use email and password — no OTP each time.",
    signInHint: "Sign in with email and password only — no verification code on every login.",
    checking: "Checking sign-in status…",
    alreadyIn: "You are already signed in. Opening your workspace…",
    password: "Password",
    confirmPassword: "Confirm password",
    passwordPlaceholder: "Enter your password",
    confirmPasswordPlaceholder: "Re-enter your password",
    passwordHint:
      "Password must be at least 8 characters and include numbers and symbols (e.g. ! @ # $ %).",
    matchingPasswords: "Passwords match.",
    notMatchingPasswords: "Passwords do not match.",
    continue: "Continue",
    emailAddress: "Email address"
  },
  fr: {
    title: "Maw3ed",
    subtitle: "Inscrivez-vous avec e-mail et mot de passe, vérifiez votre e-mail, puis ouvrez votre espace.",
    signUp: "Créer un compte",
    signIn: "Connexion",
    fullPage: "Ouvrir la page d'inscription complète",
    afterVerify: "Après vérification, changez le mot de passe via Compte → Sécurité.",
    checking: "Vérification de la session…",
    alreadyIn: "Vous êtes déjà connecté. Ouverture de l'espace…",
    password: "Mot de passe",
    confirmPassword: "Confirmer le mot de passe",
    passwordPlaceholder: "Entrez le mot de passe",
    confirmPasswordPlaceholder: "Ressaisissez le mot de passe",
    passwordHint:
      "Le mot de passe doit contenir au moins 8 caractères, avec des chiffres et des symboles (ex. ! @ # $ %).",
    matchingPasswords: "Les mots de passe correspondent.",
    notMatchingPasswords: "Les mots de passe ne correspondent pas.",
    continue: "Continuer",
    emailAddress: "Adresse e-mail"
  },
  ur: {
    title: "موعد Maw3ed",
    subtitle: "ای میل اور پاس ورڈ سے رجسٹر کریں، ای میل کی تصدیق کریں، پھر ورک اسپیس کھولیں۔",
    signUp: "اکاؤنٹ بنائیں",
    signIn: "سائن اِن",
    fullPage: "مکمل رجسٹریشن صفحہ کھولیں",
    afterVerify: "ای میل تصدیق کے بعد اکاؤنٹ → سیکیورٹی سے پاس ورڈ تبدیل کر سکتے ہیں۔",
    checking: "سائن اِن کی حالت چیک ہو رہی ہے…",
    alreadyIn: "آپ پہلے سے سائن اِن ہیں۔ ورک اسپیس کھل رہا ہے…",
    password: "پاس ورڈ",
    confirmPassword: "پاس ورڈ کی تصدیق",
    passwordPlaceholder: "پاس ورڈ درج کریں",
    confirmPasswordPlaceholder: "پاس ورڈ دوبارہ درج کریں",
    passwordHint: "پاس ورڈ کم از کم 8 حروف کا ہو، اور اس میں اعداد اور علامات (! @ # $ %) شامل ہوں۔",
    matchingPasswords: "پاس ورڈ مماثل ہیں۔",
    notMatchingPasswords: "پاس ورڈ مماثل نہیں۔",
    continue: "جاری رکھیں",
    emailAddress: "ای میل ایڈریس"
  },
  tr: {
    title: "Maw3ed",
    subtitle: "E-posta ve şifre ile kaydolun, e-postanızı doğrulayın, ardından çalışma alanınızı açın.",
    signUp: "Hesap oluştur",
    signIn: "Giriş yap",
    fullPage: "Tam kayıt sayfasını aç",
    afterVerify: "Doğrulamadan sonra Hesap → Güvenlik üzerinden şifreyi değiştirebilirsiniz.",
    checking: "Oturum kontrol ediliyor…",
    alreadyIn: "Zaten giriş yaptınız. Çalışma alanı açılıyor…",
    password: "Şifre",
    confirmPassword: "Şifreyi onayla",
    passwordPlaceholder: "Şifrenizi girin",
    confirmPasswordPlaceholder: "Şifreyi tekrar girin",
    passwordHint: "Şifre en az 8 karakter olmalı; rakam ve sembol içermelidir (örn. ! @ # $ %).",
    matchingPasswords: "Şifreler eşleşiyor.",
    notMatchingPasswords: "Şifreler eşleşmiyor.",
    continue: "Devam",
    emailAddress: "E-posta adresi"
  },
  es: {
    title: "Maw3ed",
    subtitle: "Regístrate con correo y contraseña, verifica tu correo y abre tu espacio de trabajo.",
    signUp: "Crear cuenta",
    signIn: "Iniciar sesión",
    fullPage: "Abrir la página de registro completa",
    afterVerify: "Tras verificar el correo puedes cambiar la contraseña en Cuenta → Seguridad.",
    checking: "Comprobando el inicio de sesión…",
    alreadyIn: "Ya has iniciado sesión. Abriendo el espacio…",
    password: "Contraseña",
    confirmPassword: "Confirmar contraseña",
    passwordPlaceholder: "Introduce la contraseña",
    confirmPasswordPlaceholder: "Vuelve a introducir la contraseña",
    passwordHint: "La contraseña debe tener al menos 8 caracteres e incluir números y símbolos (p. ej. ! @ # $ %).",
    matchingPasswords: "Las contraseñas coinciden.",
    notMatchingPasswords: "Las contraseñas no coinciden.",
    continue: "Continuar",
    emailAddress: "Correo electrónico"
  },
  hi: {
    title: "Maw3ed",
    subtitle: "ईमेल और पासवर्ड से साइन अप करें, ईमेल सत्यापित करें, फिर वर्कस्पेस खोलें।",
    signUp: "खाता बनाएँ",
    signIn: "साइन इन",
    fullPage: "पूरा पंजीकरण पृष्ठ खोलें",
    afterVerify: "ईमेल सत्यापन के बाद खाता → सुरक्षा से पासवर्ड बदल सकते हैं।",
    checking: "साइन-इन जाँच हो रही है…",
    alreadyIn: "आप पहले से साइन इन हैं। वर्कस्पेस खुल रहा है…",
    password: "पासवर्ड",
    confirmPassword: "पासवर्ड की पुष्टि",
    passwordPlaceholder: "पासवर्ड दर्ज करें",
    confirmPasswordPlaceholder: "पासवर्ड फिर दर्ज करें",
    passwordHint: "पासवर्ड कम से कम 8 अक्षरों का हो तथा उसमें अंक और प्रतीक (! @ # $ %) हों।",
    matchingPasswords: "पासवर्ड मेल खाते हैं।",
    notMatchingPasswords: "पासवर्ड मेल नहीं खाते।",
    continue: "जारी रखें",
    emailAddress: "ईमेल पता"
  },
  bn: {
    title: "Maw3ed",
    subtitle: "ইমেইল ও পাসওয়ার্ড দিয়ে সাইন আপ করুন, ইমেইল যাচাই করুন, তারপর ওয়ার্কস্পেস খুলুন।",
    signUp: "অ্যাকাউন্ট তৈরি",
    signIn: "সাইন ইন",
    fullPage: "পূর্ণ নিবন্ধন পৃষ্ঠা খুলুন",
    afterVerify: "ইমেইল যাচাইয়ের পর অ্যাকাউন্ট → নিরাপত্তা থেকে পাসওয়ার্ড বদলাতে পারবেন।",
    checking: "সাইন-ইন যাচাই হচ্ছে…",
    alreadyIn: "আপনি ইতিমধ্যে সাইন ইন আছেন। ওয়ার্কস্পেস খুলছে…",
    password: "পাসওয়ার্ড",
    confirmPassword: "পাসওয়ার্ড নিশ্চিত করুন",
    passwordPlaceholder: "পাসওয়ার্ড লিখুন",
    confirmPasswordPlaceholder: "পাসওয়ার্ড আবার লিখুন",
    passwordHint: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে এবং সংখ্যা ও প্রতীক (! @ # $ %) থাকতে হবে।",
    matchingPasswords: "পাসওয়ার্ড মিলেছে।",
    notMatchingPasswords: "পাসওয়ার্ড মেলেনি।",
    continue: "চালিয়ে যান",
    emailAddress: "ইমেইল ঠিকানা"
  },
  de: {
    title: "Maw3ed",
    subtitle: "Registrieren Sie sich mit E-Mail und Passwort, bestätigen Sie Ihre E-Mail und öffnen Sie Ihren Arbeitsbereich.",
    signUp: "Konto erstellen",
    signIn: "Anmelden",
    fullPage: "Vollständige Registrierungsseite öffnen",
    afterVerify: "Nach der Bestätigung können Sie das Passwort unter Konto → Sicherheit ändern.",
    checking: "Anmeldung wird geprüft…",
    alreadyIn: "Sie sind bereits angemeldet. Arbeitsbereich wird geöffnet…",
    password: "Passwort",
    confirmPassword: "Passwort bestätigen",
    passwordPlaceholder: "Passwort eingeben",
    confirmPasswordPlaceholder: "Passwort erneut eingeben",
    passwordHint: "Das Passwort muss mindestens 8 Zeichen haben und Zahlen sowie Symbole enthalten (z. B. ! @ # $ %).",
    matchingPasswords: "Passwörter stimmen überein.",
    notMatchingPasswords: "Passwörter stimmen nicht überein.",
    continue: "Weiter",
    emailAddress: "E-Mail-Adresse"
  },
  pt: {
    title: "Maw3ed",
    subtitle: "Registe-se com e-mail e palavra-passe, verifique o e-mail e abra o seu espaço de trabalho.",
    signUp: "Criar conta",
    signIn: "Entrar",
    fullPage: "Abrir a página de registo completa",
    afterVerify: "Após a verificação, altere a palavra-passe em Conta → Segurança.",
    checking: "A verificar o início de sessão…",
    alreadyIn: "Já tem sessão iniciada. A abrir o espaço…",
    password: "Palavra-passe",
    confirmPassword: "Confirmar palavra-passe",
    passwordPlaceholder: "Introduza a palavra-passe",
    confirmPasswordPlaceholder: "Introduza novamente a palavra-passe",
    passwordHint: "A palavra-passe deve ter pelo menos 8 caracteres e incluir números e símbolos (ex. ! @ # $ %).",
    matchingPasswords: "As palavras-passe coincidem.",
    notMatchingPasswords: "As palavras-passe não coincidem.",
    continue: "Continuar",
    emailAddress: "Endereço de e-mail"
  },
  ru: {
    title: "Maw3ed",
    subtitle: "Зарегистрируйтесь с email и паролем, подтвердите почту и откройте рабочее пространство.",
    signUp: "Создать аккаунт",
    signIn: "Войти",
    fullPage: "Открыть полную страницу регистрации",
    afterVerify: "После подтверждения смените пароль в Аккаунт → Безопасность.",
    checking: "Проверка входа…",
    alreadyIn: "Вы уже вошли. Открываем пространство…",
    password: "Пароль",
    confirmPassword: "Подтвердите пароль",
    passwordPlaceholder: "Введите пароль",
    confirmPasswordPlaceholder: "Введите пароль ещё раз",
    passwordHint: "Пароль должен быть не короче 8 символов и содержать цифры и спецсимволы (например ! @ # $ %).",
    matchingPasswords: "Пароли совпадают.",
    notMatchingPasswords: "Пароли не совпадают.",
    continue: "Продолжить",
    emailAddress: "Адрес email"
  },
  zh: {
    title: "Maw3ed",
    subtitle: "使用电子邮箱和密码注册，验证邮箱后打开工作区。",
    signUp: "创建账户",
    signIn: "登录",
    fullPage: "打开完整注册页面",
    afterVerify: "验证邮箱后可在账户 → 安全中更改密码。",
    checking: "正在检查登录状态…",
    alreadyIn: "您已登录。正在打开工作区…",
    password: "密码",
    confirmPassword: "确认密码",
    passwordPlaceholder: "输入密码",
    confirmPasswordPlaceholder: "再次输入密码",
    passwordHint: "密码至少 8 个字符，并需包含数字和符号（如 ! @ # $ %）。",
    matchingPasswords: "两次密码一致。",
    notMatchingPasswords: "两次密码不一致。",
    continue: "继续",
    emailAddress: "电子邮箱"
  },
  ja: {
    title: "Maw3ed",
    subtitle: "メールとパスワードで登録し、メール確認後にワークスペースを開きます。",
    signUp: "アカウント作成",
    signIn: "サインイン",
    fullPage: "完全な登録ページを開く",
    afterVerify: "確認後、アカウント → セキュリティからパスワードを変更できます。",
    checking: "サインイン状態を確認中…",
    alreadyIn: "すでにサインインしています。ワークスペースを開いています…",
    password: "パスワード",
    confirmPassword: "パスワード確認",
    passwordPlaceholder: "パスワードを入力",
    confirmPasswordPlaceholder: "パスワードを再入力",
    passwordHint: "パスワードは8文字以上で、数字と記号（例: ! @ # $ %）を含めてください。",
    matchingPasswords: "パスワードが一致しています。",
    notMatchingPasswords: "パスワードが一致しません。",
    continue: "続行",
    emailAddress: "メールアドレス"
  },
  ko: {
    title: "Maw3ed",
    subtitle: "이메일과 비밀번호로 가입하고, 이메일을 확인한 뒤 워크스페이스를 여세요.",
    signUp: "계정 만들기",
    signIn: "로그인",
    fullPage: "전체 가입 페이지 열기",
    afterVerify: "이메일 확인 후 계정 → 보안에서 비밀번호를 변경할 수 있습니다.",
    checking: "로그인 상태 확인 중…",
    alreadyIn: "이미 로그인되어 있습니다. 워크스페이스를 여는 중…",
    password: "비밀번호",
    confirmPassword: "비밀번호 확인",
    passwordPlaceholder: "비밀번호 입력",
    confirmPasswordPlaceholder: "비밀번호 다시 입력",
    passwordHint: "비밀번호는 8자 이상이어야 하며 숫자와 기호(! @ # $ % 등)를 포함해야 합니다.",
    matchingPasswords: "비밀번호가 일치합니다.",
    notMatchingPasswords: "비밀번호가 일치하지 않습니다.",
    continue: "계속",
    emailAddress: "이메일 주소"
  },
  id: {
    title: "Maw3ed",
    subtitle: "Daftar dengan email dan kata sandi, verifikasi email, lalu buka ruang kerja Anda.",
    signUp: "Buat akun",
    signIn: "Masuk",
    fullPage: "Buka halaman pendaftaran lengkap",
    afterVerify: "Setelah verifikasi, ubah kata sandi di Akun → Keamanan.",
    checking: "Memeriksa status masuk…",
    alreadyIn: "Anda sudah masuk. Membuka ruang kerja…",
    password: "Kata sandi",
    confirmPassword: "Konfirmasi kata sandi",
    passwordPlaceholder: "Masukkan kata sandi",
    confirmPasswordPlaceholder: "Masukkan ulang kata sandi",
    passwordHint: "Kata sandi minimal 8 karakter dan harus berisi angka serta simbol (mis. ! @ # $ %).",
    matchingPasswords: "Kata sandi cocok.",
    notMatchingPasswords: "Kata sandi tidak cocok.",
    continue: "Lanjut",
    emailAddress: "Alamat email"
  }
};

export function getAuthCopy(locale) {
  return AUTH_COPY[locale] || AUTH_COPY.en;
}

export function getAuthLocales() {
  return LOCALES;
}

/** Clerk UI localization overrides (password + confirm password + hints). */
export function getClerkLocalization(locale) {
  const copy = getAuthCopy(locale);
  return {
    locale,
    formFieldLabel__emailAddress: copy.emailAddress,
    formFieldLabel__password: copy.password,
    formFieldLabel__confirmPassword: copy.confirmPassword,
    formFieldInputPlaceholder__password: copy.passwordPlaceholder,
    formFieldInputPlaceholder__confirmPassword: copy.confirmPasswordPlaceholder,
    formFieldError__matchingPasswords: copy.matchingPasswords,
    formFieldError__notMatchingPasswords: copy.notMatchingPasswords,
    formButtonPrimary: copy.continue,
    unstable__errors: {
      form_password_pwned: copy.passwordHint,
      form_password_length_too_short: copy.passwordHint,
      form_password_no_uppercase: copy.passwordHint,
      form_password_no_lowercase: copy.passwordHint,
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
}

export function explainPasswordRules(locale, password) {
  const copy = getAuthCopy(locale);
  const value = String(password || "");
  const checks = {
    length: value.length >= PASSWORD_RULES.minLength,
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value)
  };
  return {
    hint: copy.passwordHint,
    ok: checks.length && checks.number && checks.symbol,
    checks
  };
}
