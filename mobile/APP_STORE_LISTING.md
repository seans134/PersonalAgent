# Atlas — App Store Connect Submission Package

Drafted from the current state of this repo on 2026-07-22. Everything under "Copy to submit"
is ready to paste into App Store Connect. Everything under "Missing before you can submit"
is a real blocker — go through that list top to bottom.

---

## 1. App identity (from repo config)

| Field | Value | Source |
|---|---|---|
| App name | Atlas | [mobile/app.json](mobile/app.json) |
| Bundle ID | `com.personalagent.atlas` | [mobile/app.json](mobile/app.json) |
| URL scheme | `atlas://` | [mobile/app.json](mobile/app.json) |
| Version | 1.0.0 (first submission) | [mobile/app.json](mobile/app.json) |
| EAS project ID | `f7925550-7152-4fa9-b41f-157f565bd834` | [mobile/app.json](mobile/app.json) |
| Sentry org/project | `atlas-hu` / `atlas` | [mobile/app.json](mobile/app.json) |
| Platform | iOS (`supportsTablet: true`) + Android | [mobile/app.json](mobile/app.json) |
| Encryption | `ITSAppUsesNonExemptEncryption: false` already set — standard export-compliance question is pre-answered | [mobile/app.json](mobile/app.json) |
| In-app purchases | None found (no IAP/RevenueCat dependency) — app is free with no purchases | [mobile/package.json](mobile/package.json) |

**Important:** "Atlas" is an extremely common app name. Search App Store Connect / the App Store for name
availability before you lock this in — you may need a more specific variant (e.g. "Atlas – Daily Planner").

---

## 2. What the app actually does (from the code)

Reading [mobile/components/MobileAppShell.tsx](mobile/components/MobileAppShell.tsx), [MVP_SLICE.md](MVP_SLICE.md),
and [roadmap.md](roadmap.md), Atlas is a mobile-first personal planning app built on Supabase auth + a Next.js API
backend, with these real (shipped) features:

- **Onboarding** — free-text goals with priority, work/school/sleep/wake schedule, focus-block and workout
  preferences. Includes a natural-language onboarding panel that parses free text into structured profile data.
- **Local calendar** — one-off events and recurring weekly schedule blocks (classes, shifts, commitments).
  No Google Calendar sync (explicitly removed — see `db/drop_google_calendar.sql` and the "Drop Google Calendar"
  commit); this is a self-contained in-app calendar only.
- **Daily planner** — `POST /api/plan/today` deterministically builds a today-plan from goals + free calendar
  time; an optional Gemini pass rewrites the copy/summary but never changes the computed times.
- **Goals** — add goals, mark achieved, list active vs. completed.
- **Meals & Meal Coach** — nutrition logs, saved meals, natural-language meal logging, and suggestion panel.
- **Workouts, Workout Plan & Workout Coach** — training logs, weekly workout schedule, natural-language logging,
  and suggestions.
- **Notifications** — locally scheduled reminders for the day's plan and recurring workout/meal items
  (`expo-notifications`; no server push found — reminders are scheduled on-device).
- **Account & settings** — password reset via native deep link (`atlas://auth/callback`), in-app account deletion.
- **Analytics/diagnostics** — PostHog (product events) and Sentry (crash/error) are wired but stay inactive unless
  their keys are configured; both are documented as privacy-bounded (no goal/meal/note/email content in events).

This is **not** a medical, nutrition, or fitness-credentialed product — the app's own Terms of Use
([src/app/terms/page.tsx](src/app/terms/page.tsx)) explicitly disclaim medical/professional advice. Keep marketing
copy consistent with that (no "medical-grade," "doctor-recommended," etc.).

---

## 3. Copy to submit

### App name (30 char max)
```
Atlas
```
(4 chars — well under the limit; the constraint is availability, not length.)

### Subtitle (30 char max)
```
Daily plans for real goals
```
(27 chars)

### Promotional text (170 char max, editable anytime without review)
```
Tell Atlas your goals and your real schedule. It builds today's plan around the time you actually have — then helps you log meals and workouts as you go.
```

### Description (4000 char max)
```
Atlas turns your goals and your real schedule into a plan for today — not a generic template.

HOW IT WORKS
Tell Atlas what you're working toward (save for a car, learn a language, get stronger — anything),
your work/school hours, sleep and wake times, and how you like to work. Atlas looks at what's already
on your calendar and builds a realistic plan for today: a top-priority goal action, a focus block, and
a health or wellbeing action when you want one — fit into the time you actually have free.

YOUR SCHEDULE, YOUR RULES
Add one-off events and recurring weekly blocks — classes, shifts, standing commitments — in Atlas's
built-in calendar. No calendar account linking required. Your plan is generated around what's really
on your schedule, and never double-books existing events.

GOALS THAT STICK AROUND
Track goals as active or completed, and reopen one if you're not done after all. No streak-shaming,
no gamified guilt — just a running list of what you're actually trying to do.

MEAL & WORKOUT COACHING
Log meals and workouts in plain language, get suggestions based on your goals and schedule, and see
your workout plan laid out for the week. Everything is optional and additive to the daily plan.

REMINDERS ON YOUR TERMS
Turn on local reminders for today's plan and your recurring workout or meal items. Reminders run on
your device — turn them off anytime from Settings.

PRIVACY BY DESIGN
Atlas is not a medical or nutrition-credentialed service — it's a planning tool. Your account, goals,
schedule, and logs are yours: delete your account and its data from Settings whenever you want. Read
the full privacy policy and terms in-app or at [YOUR_DOMAIN]/privacy and [YOUR_DOMAIN]/terms.

Atlas is under active development. Feedback shapes what ships next.
```
*(Replace `[YOUR_DOMAIN]` once the production domain is picked — see missing items below.)*

### Keywords (100 char max, comma-separated, no spaces)
```
daily planner,goal tracker,schedule,routine,productivity,meal log,workout log,habit,coach,calendar
```

### What's New (first release)
```
Welcome to Atlas — plan your day around your real goals and schedule.
```

### Category
- **Primary:** Productivity
- **Secondary:** Health & Fitness *(reasonable given Meal Coach / Workout Coach; drop this if you'd rather keep
  the review scope purely productivity-focused — Health & Fitness category can trigger extra App Review scrutiny
  on health claims, which lines up with the "not medical advice" disclaimer already in your Terms)*

### Age rating
Answer the App Store Connect age-rating questionnaire based on the app's real content:
- No objectionable content (violence, mature themes, gambling, etc.) → expect **4+**
- **AI-generated content: Yes** — the planner's summary/wording and the meal/workout coach suggestions are
  Gemini-generated (see [README.md](README.md) and `MealCoachScreen`/`WorkoutCoachScreen`). Apple added this
  question to the questionnaire; answer honestly since it's a real, working feature.
- Unrestricted web access: No

### Pricing
No pricing tier or IAP code exists in the repo — this reads as intended to ship as a **free app, no
in-app purchases**. Confirm that's still the intent before setting the price tier to Free in ASC.

---

## 4. App Privacy ("privacy nutrition label") — draft answers

Based on the data flows actually described in [src/app/privacy/page.tsx](src/app/privacy/page.tsx) and
[mobile/PRODUCTION_ANALYTICS.md](mobile/PRODUCTION_ANALYTICS.md):

**Data used to track you:** None. No ads SDK, no cross-app/cross-site tracking, no ATT prompt needed.

**Data linked to your identity** (tied to the Supabase user ID):
| Apple category | What | Purpose |
|---|---|---|
| Contact Info | Email address | App functionality (auth) |
| User Content | Goals, calendar events, schedule blocks, daily plans, meal logs, workout logs, notes/feedback to AI features | App functionality |
| Health & Fitness | Body-profile measurements, meal/workout logs *(check this box even though there's no HealthKit integration — Apple's taxonomy covers self-reported health/fitness data too)* | App functionality |
| Identifiers | User ID (Supabase UUID) | App functionality, analytics |
| Diagnostics | Crash data, performance data (Sentry — tagged with the Supabase UUID per [PRODUCTION_ANALYTICS.md](mobile/PRODUCTION_ANALYTICS.md)) | App functionality |
| Usage Data | Product interaction events (PostHog — onboarding completed, plan generated, etc.) | Analytics |

**Data not collected:** Location, Contacts, Browsing History, Financial Info, Precise/Coarse location,
Photos, Search History, Sensitive Info (as Apple defines it), Purchases.

Note the privacy policy is explicit that PostHog/Sentry stay **disabled** if their keys aren't configured
in a given build — if you ship a build without those keys set, the label should reflect only what's actually
active in that build.

---

## 5. Missing before you can submit

These are real gaps, not nice-to-haves:

1. **Production domain isn't set.** [mobile/APP_STORE_METADATA.md](mobile/APP_STORE_METADATA.md) and both
   `.env.example` files still say `YOUR_DOMAIN` / `your-production-site.example.com`. You need the web app
   ([README.md](README.md), Next.js) deployed to a real HTTPS domain before Privacy Policy URL, Support URL,
   and `EXPO_PUBLIC_WEBSITE_URL` can be filled in. The pages themselves (`/privacy`, `/support`, `/terms`) already
   exist and are ready to deploy as-is.
2. **Marketing URL** — optional in ASC. Could point at the deployed site's homepage once it exists, or be left blank.
3. **Screenshots — none exist in this repo.** `mobile/assets/` only has app icons and a splash icon, no device
   screenshots. You need at minimum a 6.7" (iPhone 15/16 Pro Max class) screenshot set; iPad screenshots too since
   `supportsTablet: true`. Easiest path: run the app (`npx expo start`, or an EAS build) through the Dashboard,
   Onboarding, Calendar, Goals, and Meal/Workout Coach screens and capture real screenshots — don't fabricate UI.
4. **App Store 1024×1024 icon** — `mobile/assets/icon.png` exists for the app itself; confirm it (or an EAS-generated
   variant) meets the App Store Connect marketing-icon spec (1024×1024, no alpha/transparency, no rounded corners
   baked in).
5. **`eas.json` submit config is empty** — [mobile/eas.json](mobile/eas.json) has `"submit": { "production": {} }`
   with no `appleId`, `ascAppId`, or `appleTeamId`. Needed before `eas submit -p ios` will work.
6. **Apple Developer Program enrollment** — confirm the account is enrolled (paid, $99/yr) and the bundle ID
   `com.personalagent.atlas` is registered in the Apple Developer portal.
7. **App Review test account** — Atlas requires Supabase email/password sign-in with no guest mode found in the
   code. App Review will need a working demo account (email + password) in the App Review notes, since reviewers
   can't complete your onboarding flow otherwise.
8. **EAS/Sentry secrets for production** — [mobile/PRODUCTION_ANALYTICS.md](mobile/PRODUCTION_ANALYTICS.md) and
   [mobile/PRODUCTION_AUTH.md](mobile/PRODUCTION_AUTH.md) list required EAS environment variables
   (`EXPO_PUBLIC_POSTHOG_API_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `EXPO_PUBLIC_AUTH_REDIRECT_URL`,
   Supabase redirect URL allow-list) — confirm these are actually set in the EAS production environment, not just documented.
9. **Category decision** — pick Productivity-only vs. Productivity + Health & Fitness (see §3) before filling
   out ASC, since it affects the age-rating and review flow.
10. **Support email vs. issue tracker** — [src/app/support/page.tsx](src/app/support/page.tsx) falls back to a
    public GitHub issue tracker (`github.com/seans134/PersonalAgent/issues/new`) if `NEXT_PUBLIC_SUPPORT_EMAIL`
    isn't set. A public issue tracker as your only support channel is unusual for an App Store listing — decide
    whether to set a real support email for the production deployment.

---

## 6. Not blockers, just flag

- Account deletion is implemented in-app (Settings → Delete Account), which satisfies Apple's mandatory
  account-deletion requirement — good, nothing to do there.
- `ITSAppUsesNonExemptEncryption: false` is already set in [mobile/app.json](mobile/app.json), so the export-compliance
  question in ASC should be pre-answered as "No" for standard HTTPS-only encryption use.
