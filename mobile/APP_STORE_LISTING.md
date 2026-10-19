# Atlas: Study Planner — App Store Connect Submission Package

Rewritten for the student release on 2026-10-19 (Phase 1: syllabus import, daily study plan, grade math,
exam reminders). Meal and workout tracking are hidden behind `features.wellnessTracking` and are not part
of this listing. Everything under "Copy to submit" is ready to paste into App Store Connect. Everything
under "Missing before you can submit" is a real blocker.

---

## 1. App identity (from repo config)

| Field | Value | Source |
|---|---|---|
| App Store name | Atlas: Study Planner | this file (home-screen name stays "Atlas" in [mobile/app.json](mobile/app.json)) |
| Bundle ID | `com.personalagent.atlas` (unchanged) | [mobile/app.json](mobile/app.json) |
| URL scheme | `atlas://` (unchanged) | [mobile/app.json](mobile/app.json) |
| Version | 1.0.0 (first submission) | [mobile/app.json](mobile/app.json) |
| EAS project ID | `f7925550-7152-4fa9-b41f-157f565bd834` | [mobile/app.json](mobile/app.json) |
| Sentry org/project | `atlas-hu` / `atlas` | [mobile/app.json](mobile/app.json) |
| Platform | iOS (`supportsTablet: true`) + Android | [mobile/app.json](mobile/app.json) |
| Encryption | `ITSAppUsesNonExemptEncryption: false` already set | [mobile/app.json](mobile/app.json) |
| In-app purchases | None — free, no purchases | [mobile/package.json](mobile/package.json) |

"Atlas" alone is a common app name; "Atlas: Study Planner" is more specific, but still check availability in
App Store Connect before locking it in.

---

## 2. What the app does (student release)

- **Syllabus import** — photograph a syllabus, pick a PDF or Word file, or paste the text. Atlas pulls out the
  course, grade categories and weights, and dated assignments, quizzes, and exams for the student to review
  before anything is saved (Gemini-assisted parsing).
- **Class times** — weekly class blocks and work shifts in the built-in calendar (no calendar account linking).
- **Daily study plan** — "Plan my day" builds today's study plan around class times, deadlines, and exams.
  Times are computed deterministically; an optional AI pass only rewrites the wording.
- **Grade math** — weighted course average, a "what do I need on the rest" status against a target grade, and
  a what-if projection for the final.
- **Exam reminders** — local notifications 3 days and 1 day before each course's next exam, at 9:00 device time.
  On by default; can be turned off in Notification settings.
- **Account & settings** — password reset via deep link, in-app account deletion.

Atlas does not give academic, medical, or professional advice. Keep marketing copy to what the app does
(no "guaranteed A's" or similar claims).

---

## 3. Copy to submit

### App name (30 char max)
```
Atlas: Study Planner
```
(20 chars)

### Subtitle (30 char max)
```
Syllabus to daily study plan
```
(28 chars)

### Promotional text (170 char max, editable anytime without review)
```
Snap your syllabus and Atlas builds a daily study plan around your classes, shows what you need on the final, and reminds you before every exam.
```
(144 chars)

### Description (4000 char max)
```
Atlas turns your syllabi and class schedule into a study plan for today.

IMPORT YOUR SYLLABUS
Take a photo of a syllabus, pick a PDF or Word file, or paste the text. Atlas pulls out the grade
weights and every dated assignment, quiz, and exam. You review and edit everything before it's saved.

A DAILY STUDY PLAN AROUND YOUR CLASSES
Add your class times and work shifts once. Tap "Plan my day" and Atlas fits study time into the gaps,
putting what's due soonest and what counts most first. It never double-books a class.

KNOW WHAT YOU NEED ON THE FINAL
Enter your scores as they come back. Atlas keeps a weighted average for each course and tells you the
average you need on the remaining work to hit your target grade. Try a what-if score to see where
you'd finish.

EXAM REMINDERS
Atlas reminds you 3 days and 1 day before each exam, so nothing sneaks up on you. Reminders run on
your device, and you can turn them off any time in Settings.

YOUR DATA, YOUR CALL
No ads. Delete your account and its data from Settings whenever you want. Read the privacy policy
and terms in the app or at [YOUR_DOMAIN]/privacy and [YOUR_DOMAIN]/terms.
```
*(Replace `[YOUR_DOMAIN]` once the production domain is picked — see missing items below.)*

### Keywords (100 char max, comma-separated, no spaces)
```
student,syllabus,homework,exam,grade calculator,final,college,class schedule,assignment,reminder
```
(96 chars. "Atlas", "Study", and "Planner" are already indexed from the name, so they aren't repeated here.)

### Screenshot captions (one per screenshot, in this order)
1. **Today** — "Your study plan for today, built around your classes"
2. **Syllabus import** — "Snap a syllabus. Atlas pulls out every deadline"
3. **Import review** — "Check grade weights and due dates before saving"
4. **Course detail** — "See what you need on the rest to hit your target"
5. **Upcoming exams** — "Reminders 3 days and 1 day before each exam"
6. **Calendar** — "Add class times once. Study time fits around them"

### What's New (first release)
```
Welcome to Atlas: import your syllabi, plan today's studying, and stay ahead of exams.
```

### Category
- **Primary:** Education
- **Secondary:** Productivity

### Age rating
- No objectionable content → expect **4+**.
- **AI-generated content: Yes** — syllabus parsing and the plan summary wording use Gemini.
- Unrestricted web access: No.

### Pricing
Free, no in-app purchases. Confirm before setting the price tier in ASC.

---

## 4. App Privacy ("privacy nutrition label") — draft answers

Based on [src/app/privacy/page.tsx](src/app/privacy/page.tsx) and
[mobile/PRODUCTION_ANALYTICS.md](mobile/PRODUCTION_ANALYTICS.md):

**Data used to track you:** None. No ads SDK, no cross-app tracking, no ATT prompt needed.

**Data linked to your identity** (tied to the Supabase user ID):
| Apple category | What | Purpose |
|---|---|---|
| Contact Info | Email address | App functionality (auth) |
| User Content | Courses, grade categories, assignments and scores, calendar events, class times, daily plans, goals | App functionality |
| Identifiers | User ID (Supabase UUID) | App functionality, analytics |
| Diagnostics | Crash and performance data (Sentry, tagged with the Supabase UUID) | App functionality |
| Usage Data | Product events (PostHog: onboarding completed, syllabus imported, plan generated, etc.) | Analytics |

**Photos / documents:** syllabus photos and files are uploaded only to be parsed and are not kept after the
course is created. Confirm that still holds for the production deployment; if they are ever stored, declare
Photos or Videos / Other User Content accordingly.

**Not collected:** Location, Contacts, Browsing History, Financial Info, Search History, Sensitive Info,
Purchases. Health & Fitness is not collected while `features.wellnessTracking` is off.

PostHog and Sentry stay disabled when their keys aren't configured; the label should match what is active
in the build you submit.

---

## 5. Missing before you can submit

1. **Production domain.** Fill in Privacy Policy URL, Support URL, and `EXPO_PUBLIC_WEBSITE_URL` once the web app
   is on its production HTTPS domain (see [mobile/APP_STORE_METADATA.md](mobile/APP_STORE_METADATA.md)).
2. **Screenshots.** None exist in the repo. Capture the six screens listed above from a real build on a 6.7"
   iPhone, plus iPad screenshots since `supportsTablet: true`. Use a demo account with realistic courses.
3. **App Store 1024×1024 icon** — confirm `mobile/assets/icon.png` meets the marketing-icon spec (no alpha,
   no baked-in rounded corners).
4. **`eas.json` submit config** — [mobile/eas.json](mobile/eas.json) needs `appleId`, `ascAppId`, and
   `appleTeamId` before `eas submit -p ios`.
5. **Apple Developer Program enrollment** and the bundle ID registered in the developer portal.
6. **App Review demo account** — sign-in is email/password only; give reviewers an account that already has a
   course, class times, and an upcoming exam so every feature is visible.
7. **EAS production secrets** — `EXPO_PUBLIC_POSTHOG_API_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
   `EXPO_PUBLIC_AUTH_REDIRECT_URL`, and the Supabase redirect allow-list (see
   [mobile/PRODUCTION_ANALYTICS.md](mobile/PRODUCTION_ANALYTICS.md) and [mobile/PRODUCTION_AUTH.md](mobile/PRODUCTION_AUTH.md)).
8. **Support channel** — [src/app/support/page.tsx](src/app/support/page.tsx) falls back to the public GitHub
   issue tracker when `NEXT_PUBLIC_SUPPORT_EMAIL` isn't set. Set a real support email for production.

---

## 6. Not blockers, just flag

- In-app account deletion (Settings → Delete Account) satisfies Apple's account-deletion requirement.
- The App Store name ("Atlas: Study Planner") and the home-screen name ("Atlas") differ on purpose: the
  longer name would be truncated under the icon.
