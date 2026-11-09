# دليل Git العملي — موعد Maw3ed (عربي مصري)

الدليل ده يشرح **بالتفصيل العملي** إزاي تشتغل بأمان على المستودع من غير ما الحماية أو الـ hooks تمنعك.

**المسار الإنجليزي المختصر:** [`GIT_WORKFLOW.md`](./GIT_WORKFLOW.md) · **المساهمون:** [`CONTRIBUTING.md`](../CONTRIBUTING.md) · **Cursor المحلي:** [`LOCAL_CURSOR_WORKFLOW.md`](./LOCAL_CURSOR_WORKFLOW.md)

> **مسار المشروع على جهازك (Windows):** `E:\UpNexa.com\maw3ed`  
> أوامر PowerShell من جوه المجلد ده إلا لو مكتوب غير كده.  
> **فاصل اسم فرع Git دايمًا `/` مش `\`:** اكتب `feat/my-change` — متكتبش `feat\my-change`.

> **مهم جدًا:** فرع Git اسمه `staging` = ممر دمج فقط. أوضاع تشغيل التطبيق تفضل **`local` و`production` بس** ([`ENVIRONMENTS.md`](./ENVIRONMENTS.md)).  
> `npm run check:staging` = فحص قبول production-like — **مش** نفس فرع Git.

---

## 0) وصفة سريعة من الألف للياء

1. احفظ كل الملفات في المحرر: **Ctrl+S** أو **Ctrl+K ثم S** (Save All).
2. `cd E:\UpNexa.com\maw3ed` ثم `git status`.
3. لو الشجرة **نظيفة** وعايز فرع **جديد تمامًا**: استخدم المساعد أو `git switch -c` (القسم 6 و 7).
4. عدّل الكود → احفظ تاني.
5. Stage **ملفات محددة** بعد مراجعة الـ diff — متستخدمش `git add -A` من غير فحص.
6. `git commit -m "feat: short english summary"` (رسائل الـ commit **إنجليزي ASCII**).
7. `git push -u origin feat/my-change` (فرع الميزة فقط).
8. افتح PR بقاعدة **`staging`** عبر المساعد أو GitHub UI.
9. استنى CI: `branch-flow` + `quality` خضراء — Pending مش فشل.
10. بعد الدمج في `staging`، الإصدار لاحقًا فقط عبر PR: `staging` → `main`، ثم النشر من `main` للـ VPS.

---

## 1) الفكرة في جملة

الشغل اليومي **مش** بيتدفع على `main` ولا على `staging` مباشرة.

```
feature branch (feat/* / fix/* / ...)
    -> Pull Request base = staging
    -> after CI green: merge into staging
    -> only then: release PR staging -> main
```

أشهر غلطة: فتح PR من `feat/...` **مباشرة على `main`**. رسالة CI المتوقعة:

`PRs into main must come from staging`

---

## 2) المصطلحات: حفظ ≠ Stage ≠ Commit ≠ Push ≠ PR ≠ Merge

| الخطوة | معناها | بيحصل فين؟ |
| --- | --- | --- |
| **Save (حفظ)** | كتابة الملف على الديسك من المحرر | محلي — Git لسه ممكن يشوفه unmodified لو ما اتحفظش |
| **Stage** | اختيار مسارات معيّنة للـ commit (`git add path`) | محلي — منطقة التجهيز |
| **Commit** | تسجيل لقطة محلية برسالة إنجليزية | محلي على فرعك |
| **Push** | رفع الـ commits للـ remote | مسموح على **فرع الميزة**؛ مرفوض على `main`/`staging` |
| **Pull Request (PR)** | طلب مراجعة/دمج بين فرعين على GitHub | مش دمج تلقائي |
| **Merge** | دمج الـ PR (أو دمج فرع في فرع محليًا) | بعد المراجعات + فحوصات CI المطلوبة |

**قبل أي تبديل فرع أو merge:** Save All ثم `git status`.

الحفظ في Cursor/VS Code **مش** بيعمل commit. والـ commit لوحده **مش** بيرفع من غير push.

---

## 3) الممرات الثلاثة (Lanes)

| الفرع | الدور |
| --- | --- |
| `feat/*`, `fix/*`, `chore/*`, `docs/*`, `feature/*`, `hotfix/*`, `cursor/*`, … | شغل يومي. **يتفرّع من أحدث `staging`** |
| `staging` | دمج التكامل قبل الإنتاج (فرع Git) |
| `main` | الإنتاج / الإصدار — يتحدث **فقط** عبر PR إصدار من `staging` |

**ملاحظة:** مش مطلوب إن `main` و `staging` يكون ليهم **نفس الـ SHA**. بعد دمج إصدار، `main` غالبًا فيه merge commit مختلف عن رأس `staging` حتى لو المحتوى متوافق.

---

## 4) طبقات الحماية

1. **حماية فروع GitHub** على `main` و `staging`: ممنوع push مباشر؛ مطلوب PR؛ مطلوب فحوصات؛ مطلوب الفرع محدّث (strict up-to-date)؛ تشمل المدراء.
2. **فحص CI اسمه `branch-flow`:** يفشل لو قاعدة الـ PR غلط أو اسم الفرع/العنوان مخالف.
3. **Hooks محلية** في [`.githooks/`](../.githooks/) (بتتفع مع `npm install` / `prepare`):
   - `pre-push`: يمنع الدفع لـ `main`/`staging` ويمنع أسماء فروع غير مسموحة.
   - `commit-msg`: يلزم Conventional Commits؛ **يستثني** الرسائل اللي بتبدأ بـ `Merge ` أو `Revert ` أو `fixup!` / `squash!`.
4. **المساعدات:** `git:new-branch` و `git:open-pr` دايمًا بتبدأ من / بتفتح على **`staging`**.

| الاسم في GitHub | المعنى |
| --- | --- |
| **`quality`** | `npm ci` + فحص syntax — من غير أسرار/Postgres |
| **`branch-flow`** | حراسة المسار/الاسم/العنوان |

اختبارات الدخان الكاملة (`test:smoke` / `test:all` / `check:staging`) تفضل محليًا — مش مطلوبة كـ GitHub required checks.

**ممنوع:** `--no-verify`، force push على المحمي، تعطيل الحماية، أو حذف قواعد الـ checks عشان «تعدّي». ومترفعش ملفات `.env` أو أسرار.

---

## 5) تجهيز الجهاز (مرة واحدة / عند اللزوم)

```powershell
cd E:\UpNexa.com\maw3ed
npm install
npm run git:setup-hooks
git config --get core.hooksPath
# expected: .githooks
```

المساعد `open-pr` يحتاج [GitHub CLI](https://cli.github.com/):

```powershell
gh --version
gh auth status
```

- Classic PAT: scope `repo`
- Fine-grained: **Contents** + **Pull requests** (read/write) على هذا المستودع

من غير `gh` تقدر تعمل commit/push لفرع الميزة وتفتح الـ PR من واجهة GitHub — بشرط **base = `staging`**.

---

## 6) بداية يوم آمنة

### أ) شجرة نظيفة — فرع جديد من أحدث staging

```powershell
cd E:\UpNexa.com\maw3ed
# Save All first
git fetch origin
git status
git branch --list "feat/my-change"
git ls-remote --heads origin "feat/my-change"
```

لو الاسم مش موجود محلي ولا على `origin`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\git\new-branch.ps1 -Name feat/my-change
# أو: npm run git:new-branch -- feat/my-change
```

#### تحذير حرج عن المساعد و`-B`

المساعد ينفّذ تقريبًا: `git fetch origin staging` ثم **`git checkout -B <name> origin/staging`**.

- `-B` يعني: لو الاسم موجود محليًا، Git **هيحوّل الفرع الموجود ليشير لأحدث staging** (خطر على شغل قديم).
- استخدم المساعد **فقط** لاسم فرع **جديد وفريد**.
- الدليل اليدوي **مش** بيستخدم `-B` (القسم 7).

### ب) تعديلات محلية على `main` أو `staging` (وسخ)

1. Save All.
2. `git status`.
3. **متستخدمش** `git reset --hard` ولا `git clean -fd` كحل افتراضي.

```powershell
git stash push -u -m "wip before leaving protected branch"
git fetch origin staging
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\git\new-branch.ps1 -Name feat/my-change
git stash pop
```

- `git stash -u` **مش** بيضم الملفات الـ ignored (مثل `.env`). الأسرار المحلية تفضل مكانها.

### ج) فرع موجود أصلًا — متضيّعش الشغل ومتعدّيش بالمساعد

```powershell
git fetch origin
git switch feat/ui-fix
git status
```

حدّثه من staging بـ **merge** (القسم 9). **متستدعِيش** `new-branch` على نفس الاسم.

### د) Stage و commit بأمان

```powershell
git status
git diff
git add docs/GIT-WORKFLOW-AR.md
git diff --staged
git commit -m "feat: short english summary"
```

لو ظهر مسار أسرار (مثل `.env`) في الـ stage: `git restore --staged <path>` فورًا.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\git\open-pr.ps1 -Title "feat: short english summary"
```

`open-pr` يرفض الفتح من `main` أو `staging`.

---

## 7) أوامر يدوية مكافئة (بدون المساعد) — فرع جديد فقط

**متستخدمش** `git checkout -B` هنا:

```powershell
cd E:\UpNexa.com\maw3ed
git fetch origin staging
git switch -c feat/my-change origin/staging
# equivalent: git checkout -b feat/my-change origin/staging
```

ثم:

```powershell
git add path\to\file.ext
git diff --staged
git commit -m "feat: my change"
git push -u origin feat/my-change
gh pr create --base staging --head feat/my-change --title "feat: my change" --body "## Summary`n- describe change"
```

---

## 8) قراءة شاشة الـ PR

| اللي بتشوفه | المعنى |
| --- | --- |
| **Checks / branch-flow = fail** | مسار/قاعدة/عنوان الـ PR مخالف — غالبًا مش معناه إن كود المنتج معطوب |
| **quality = pass/green** | syntax/install عدّى |
| **Out-of-date / Behind** | رأس فرعك مش محدّث بالنسبة لفرع **القاعدة (base)** |
| **Merge blocked** | مطلوب فاشل أو متأخر أو تعارض |

- **Failure:** الفحص خلص ورفض.
- **Pending / Queued / In progress:** لسه بيشتغل — استنى.

---

## 9) تحديث فرع ميزة متأخر: ادمج `origin/staging` (مش rebase)

السياسة: **merge** من staging داخل فرع **الميزة**، من غير rebase ومن غير force push.

```powershell
cd E:\UpNexa.com\maw3ed
git switch feat/ui-fix
git fetch origin staging
git merge origin/staging -m "chore: merge staging into feature"
```

- الرسالة الافتراضية اللي بتبدأ بـ `Merge ` **مقبولة** من الـ hook.
- الدليل بيفضّل رسالة conventional: `chore: merge staging into feature`.

لو تعارضات: حلّها → `git add <paths>` → `git commit -m "chore: merge staging into feature"` → `git push` (من غير `--force`).

لإلغاء الـ merge قبل اكتماله: `git merge --abort`.

---

## 10) إصلاح PR مفتوح على قاعدة غلط

1. غيّر قاعدة الـ PR إلى `staging` من واجهة GitHub (Edit بجانب base)، أو:

   ```powershell
   gh pr edit <N> --base staging
   ```

2. استنى إعادة تشغيل الفحوصات.
3. لو ظهر **Out-of-date مقابل staging**: نفّذ القسم 9 ثم push.
4. **متدمجش في `main` من فرع ميزة.** الإصدار: PR `staging` → `main` بعد ما الميزة تبقى جوه staging وCI أخضر.

---

## 11) مسار الإصدار

1. الميزات اتنقلت لـ `staging` عبر PRs خضراء.
2. افتح PR إصدار: **head = `staging`**, **base = `main`**.
3. استنى `quality` و **`branch-flow`**.
4. ادمج الإصدار.
5. انشر من `main` حسب [`DEPLOY_VPS.md`](./DEPLOY_VPS.md).
6. تساوي SHA بين `main` و `staging` **مش** شرط نجاح.

لو PR الإصدار ظاهر **Behind**: أمر `git merge origin/staging` وأنت على `staging` **مش** بيحل تأخر staging عن main. المسار المسموح: فرع صيانة (`sync/...` أو `chore/...`) من أحدث staging، ادمج فيه `origin/main`، افتح PR لـ `staging`، وبعدها أعد إصدار `staging` → `main`. متلفّش على القواعد ومتعطّلش checks.

---

## 12) جدول أعطال شائعة

| العرض | السبب الشائع | الحل |
| --- | --- | --- |
| Push مرفوض على `main`/`staging` | حماية + `pre-push` | فرع ميزة + PR لـ staging |
| `branch-flow`: *must come from staging* | PR للـ main من `feat/...` | غيّر base إلى `staging` (§10) |
| `branch-flow`: اسم فرع | بادئة غير مسموحة | فرع جديد باسم مسموح |
| `commit-msg` رفض | مش Conventional Commits | مثلًا: `fix: UI Fix` |
| Out-of-date على **feature → staging** | فرع الميزة متأخر | `git merge origin/staging -m "chore: merge staging into feature"` |
| Out-of-date على **staging → main** | اختلاف تاريخ الإصدار | §11 — مش نفس وصفة الميزة |
| المساعد رفض dirty tree | تعديلات غير متسجّلة | Save + commit أو stash واعي قبل فرع **جديد** |
| استخدام المساعد على اسم موجود | `-B` يعيد ضبط الفرع | متستخدمهوش؛ `git switch` للاسم الموجود |

---

## 13) تحديث محلي لـ `main` / `staging` + تنظيف الفروع

من **شجرة نظيفة** فقط — fast-forward فقط:

```powershell
cd E:\UpNexa.com\maw3ed
git status
git fetch origin

git switch main
git pull --ff-only origin main
# if non-fast-forward: STOP. Do not reset/force.

git switch staging
git pull --ff-only origin staging
```

بعد دمج ميزة:

```powershell
git push origin --delete feat/old-done
git branch -d feat/old-done
```

`main` و `staging` **متتحذفوش**.

---

## 14) مرجع سريع

- **base = main** → لازم **head = staging** فقط.
- **base = staging** → head فرع ميزة ببادئة مسموحة.
- عنوان الـ PR: Conventional Commits؛ الإصدار يقبل كمان `Release ...`.

| أمر | يفعل إيه |
| --- | --- |
| `npm run git:new-branch -- <name>` / `new-branch.ps1 -Name <name>` | فرع من `origin/staging` عبر `-B` — **لاسم جديد فقط** |
| `npm run git:open-pr` / `open-pr.ps1` | push + `gh pr create --base staging` |
| `npm run git:check-pr` | فحص CI اليدوي (`BASE_REF` / `HEAD_REF`) |
| `npm run ci:syntax` | فحص syntax المستخدم في CI |

---

## 15) قائمة تحقق سريعة

- [ ] Save All قبل التبديل/الدمج
- [ ] `git status` مفهوم
- [ ] مش بدفع `main`/`staging` مباشرة
- [ ] فرع جديد فريد من staging (أو switch على موجود من غير `-B`)
- [ ] PR base = **`staging`** (إلا إصدار `staging`→`main`)
- [ ] رسائل commit إنجليزي Conventional Commits
- [ ] Stage بمسارات صريحة + مراجعة `git diff --staged`
- [ ] مفيش أسرار / `.env` في الـ commit
- [ ] CI خلص (مش Pending)
- [ ] مفيش `--no-verify` ولا force على المحمي

---

## 16) روابط سريعة

- الإنجليزية المختصرة: [`docs/GIT_WORKFLOW.md`](./GIT_WORKFLOW.md)
- دليل المساهمة: [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- قالب الـ PR: [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md)
- البيئات (تطبيق): [`ENVIRONMENTS.md`](./ENVIRONMENTS.md)
- النشر: [`DEPLOY_VPS.md`](./DEPLOY_VPS.md)
