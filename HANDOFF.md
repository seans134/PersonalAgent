# Atlas synchronization — 2026-10-20

This section supersedes the October 19 release snapshot below.

- Pulled 28 commits by fast-forward from GitHub `main` to `283862d48aabc012ab023bd2a3ea35c938016b62`, preserving the existing README and handoff edits.
- Atlas web/API already serves that application commit in Vercel production: `dpl_Dg491YvcoRXhpnPfkq6AX5dg2r93`, [live Atlas](https://personal-agent-eight-theta.vercel.app). No application code changes were needed for this sync.
- Applied seven pending migrations to Supabase project `pjxesazjosupjqgwssle` using the linked CLI `db push`. A subsequent dry run reports up to date. Migration history now runs through `20261020210000_pro_subscription` (20 migrations total).
- New capabilities since the older snapshot: plan acceptance/check-off, exam study ramps, semester overview, course sharing, GPA tracking, study timer/manual logs, LMS deadline feeds, and Atlas Pro subscription flows, with web/mobile source parity.
- Corrected `supabase/config.toml` to Postgres 17 to match the hosted project's reported major version. This changes local configuration; it does not upgrade the hosted database.
- Installed root and mobile dependencies from their committed lockfiles. Lint and web/mobile TypeScript checks passed.
- All 650 tests passed across 70 files with `npm test -- --maxWorkers=2`. The first sandbox run could not rename Vitest temporary files; an unrestricted run then had one module-import timeout under high concurrency, resolved by reducing workers.
- Production smoke checks: `/auth` returned 200; unauthenticated subscription, GPA, current study-session and LMS-feed endpoints returned 401. This is not a full signed-in feature acceptance test.
- Database verification: all nine new tables have RLS enabled; authenticated clients cannot select `billing_webhook_events`. Advisors still flag the existing mutable `set_updated_at` search path and disabled leaked-password protection. GraphQL schema visibility warnings now cover the new tables too, and course-sharing definer functions are flagged for their intentional callable interfaces. The webhook event table intentionally has RLS with no client policies. These findings need a separate security review; this sync did not silently alter access contracts.
- Production environment names confirm Stripe and RevenueCat billing configuration is absent. Purchases remain unavailable and `PRO_ENFORCE_LIMITS` defaults off. Complete [Pro setup](docs/pro-subscription-setup.md) before enabling billing or limits.
- The pre-sync latest iOS artifact was build 13 at `2f411d7`; it lacks these newer features. Physical-device QA and App Store/TestFlight submission remain separate release steps.
- Started iOS production build **14** from application commit `283862d`, using existing signing credentials: [EAS build](https://expo.dev/accounts/seans134/projects/atlas/builds/e7174dc5-8801-44e2-b3b6-8b044be0718c). Check the linked build for its latest status. No automatic store submission was requested. EAS production has the API/Supabase/website variables but no RevenueCat public SDK key, so purchases remain unconfigured on mobile as well.
- Preserved existing stashes and other worktrees. Historical claims below apply only to the October 19 snapshot.

---
# Atlas handoff

Updated: **2026-10-19**, America/Toronto. Repository: `C:\git\PersonalAgent`.

This is the current engineering and release handoff. It distinguishes implemented code, deployed services, completed builds, and work still requiring verification. Update it after the next release; older plans are historical context rather than the source of current delivery status.

## 1. Current release at a glance

| Surface | State | Reference |
| --- | --- | --- |
| Web and API | Vercel production **READY**, production alias confirmed during this handoff | [Live Atlas](https://personal-agent-eight-theta.vercel.app) |
| Production source | `2f411d731912b5fdc561286af9ca9e8f93cd5958` | `feat: import schedules and unify Profile across web and mobile` |
| Database | Schedule/Profile migration applied successfully during this session through the linked Supabase CLI | `supabase/migrations/20261019204801_schedule_import_and_profile.sql` |
| iOS | EAS production build **13**, version **1.0.0**, **FINISHED**; same source commit | [Build details](https://expo.dev/accounts/seans134/projects/atlas/builds/33ab299b-1d69-462e-a3c6-890be691a2b1) |
| App Store/TestFlight | No submission or promotion performed in this session; distribution to users is not established by the completed build | Requires follow-up |
| Physical-device QA | Not completed; no iPhone connected to this Windows workspace | See checklist below |
| Android release | Source changes exist in the shared Expo app; production package/signing is not configured in this repo | No Android release built here |

Vercel deployment: `dpl_FdNxLAm5RL56g3oN6Wr2uozijXDg`, project `personal-agent`, project ID `prj_LJNJfIlG5OpqsWlz7VPj71xjlFaQ`, team ID `team_hpXUGnkEcfzZIqQ3KSTPf7jh`. Deployment URL: `https://personal-agent-gfdhryfj5-personal-agent.vercel.app`. Production region: `iad1`.

Supabase linked project: **Personal Agent**, ref `pjxesazjosupjqgwssle`. The migration application and security checks were verified during implementation; this documentation task did not reapply migrations or perform a new database health audit.

EAS project: `@seans134/atlas`, ID `f7925550-7152-4fa9-b41f-157f565bd834`. iOS bundle ID: `com.personalagent.atlas`. Build ID: `33ab299b-1d69-462e-a3c6-890be691a2b1`, distribution `STORE`, completed `2026-10-19T21:17:12.139Z`. Existing remote signing credentials were reused. A store-distribution IPA is not evidence of an installed development build or a completed App Store release.

## 2. Git state and preserved work

- Active branch: **`main`**.
- Local `HEAD`, local `origin/main`, and GitHub `refs/heads/main` all matched **`2f411d731912b5fdc561286af9ca9e8f93cd5958`** when checked for this handoff.
- Remote: `https://github.com/seans134/PersonalAgent.git`.
- Working tree was clean before creating this handoff. This documentation task adds `HANDOFF.md` and a README link; these documentation edits are left uncommitted and unpushed. The deployed application commit remains `2f411d7`.
- No new application changes or deployment were made by this documentation task.
- A preserved stash remains: `stash@{0}: On main: Backup local calendar and syllabus work before production reconciliation`. Inspect its diff before deciding whether anything still needs recovery. Do not blindly apply or drop it; some work may already be represented in the release.
- A second Git worktree remains at `C:/git/PersonalAgent/.claude/worktrees/habit-insights`, branch `worktree-habit-insights`, commit `cb0ed86`. It was not modified or removed here.
- The `worktree-habit-insights`, `mobile-parity-and-coach-unification`, and `mobile-dashboard-and-bottom-tabs` branch tips are ancestors of current `main` (zero commits unique to those branch tips when compared with `main`). Their presence does **not** mean those branches contain undeployed features. Other historical local branches also remain; inspect differences before resuming any of them.

Recent commits, newest first:

| Commit | Work |
| --- | --- |
| `2f411d7` | Schedule imports and unified Profile on web/mobile |
| `ccf52a3` | Course dates in Calendar and improved syllabus timing |
| `6697f80` | Remove-event action in the calendar editor |
| `05d82f5` | Merge of PR #11 |
| `6ad7247` | Reset web PostHog identity on sign-out |
| `f72a908` | Student copy, App Store listing, core-loop analytics |

Vercel Git integration deployed the push to `main` automatically. Inspect the Git-triggered deployment before starting a manual deployment, to avoid duplicate production builds. An earlier duplicate manual deployment was canceled; the READY deployment above is the current release.

## 3. Product and architecture

Atlas currently focuses on students: syllabus import, class/work commitments, daily study planning, courses, grade calculations, and exam reminders. It also retains goals and broader personal-planning code.

- Web: Next.js 16 / React 19; UI and APIs under `src/`.
- Mobile: Expo SDK **54** / React Native; `mobile/`. Keep SDK 54 unless an upgrade is explicitly planned; read its versioned docs before Expo-specific changes.
- Shared pure logic: `packages/core`, including calendar expansion, planner, grades, schedule drafts/validation, profile validation, feature switches, and analytics names.
- Shared authenticated endpoints: `/api/mobile/*`, consumed by both platforms for the new features. Existing web routes also remain.
- Supabase provides Auth and Postgres with user ownership/RLS. Schema changes must be new CLI migrations in `supabase/migrations/`, applied with `supabase db push`; never paste schema SQL into the dashboard.
- Gemini parses syllabus/schedule documents and optionally improves plan wording. The daily planner computes times deterministically; Gemini does not choose or alter its time blocks.
- Meal, workout, and related wellness screens/code remain but are disabled by shared `features.wellnessTracking: false` in `packages/core/src/features.ts`.
- Root `AGENTS.md` requires web/mobile parity, API-driven business logic, shared core logic, and core-loop metrics. `mobile/AGENTS.md` adds the SDK constraint.

Existing capabilities include email/password authentication, onboarding, goals, local day/week/month Calendar, recurring schedule blocks, course/category/item management, weighted averages and needed-score projections, syllabus import, course dates in Calendar, study-time reservation, and local mobile exam reminders.

## 4. Work completed in this session

### Schedule uploads

- **Import schedule** entry points in Calendar, School & work, and Weekly rhythm on both platforms.
- One PDF or supported image per parse, up to **4 MiB**. Native entry points include document picking, photo library, and camera; photo helpers compress images for the upload limit.
- Gemini extracts repeating and dated school/work entries into a shared draft. Parsing does not write schedule records or retain original uploads on the server.
- Editable review with inclusion controls, weekdays/dates, start/end times, next-day ending, term bounds or explicit **Ongoing**, warnings, and seven-day calendar preview.
- Missing required information excludes entries until corrected; the model is instructed not to invent dates, years, AM/PM, or times. The server prevents the AI from opting the user into ongoing recurrence.
- Recurring rows save to Weekly rhythm; dated rows save to Calendar. Both feed daily planning.
- Existing commitments are preserved. Exact duplicates are skipped; overlaps require explicit acceptance. Revised uploads add entries and do not remove obsolete entries from older uploads.
- Parsing errors retain current input/review state and allow retry or manual entry.
- Apply runs transactionally in Postgres, with a per-user advisory transaction lock, duplicate rechecks, ownership checks, and created/skipped counts. Retries and concurrent submissions were tested.
- Import analytics use counts/categories only: `schedule_import_parsed`, `schedule_import_completed`, `schedule_import_failed`, and `schedule_added`. Duplicate counts are included in completion properties.

### Scheduling changes

- Recurring blocks support nullable `effective_from` / `effective_until` and `end_day_offset`; dated events support `end_day_offset` and timezone.
- Existing records default to their previous same-day behavior.
- Shared Calendar expansion displays overnight shifts as portions on adjacent dates while retaining the original item's identity. Editing/deleting a displayed portion targets the original record.
- Date bounds are inclusive for the occurrence's start date; a valid final overnight occurrence can occupy the following morning.
- Planner occupancy includes previous-day overnight tails and honors term bounds. “Today” uses the profile timezone.
- Timezone limitation: imports use the profile timezone, and the apply API rejects mismatched entry timezones. Profile timezone changes preserve entered wall-clock schedule times; they do not convert existing commitments between zones. Cross-timezone documents need explicit follow-up validation/product decisions.

### Profile and account controls

- Web `/profile`; legacy `/settings` redirects there.
- Mobile **More** tab becomes **Profile**, preserving enabled secondary links.
- Personal details: display name, email, timezone.
- Planning: existing focus-block length, work-hour defaults, unavailable-time preferences.
- Account: current-password-verified password changes, confirmed email changes, recovery email, sign-out, and password-verified account deletion with explicit destructive confirmation.
- Current password verification occurs server-side using an isolated Supabase session. Credentials are not logged or added to analytics.
- Appearance remains device-specific (system/light/dark). Native reminders retain their existing controls. Web explains that device reminders are managed in the mobile app.
- Support, privacy, and terms links remain available.

### Important implementation files

| Area | Files |
| --- | --- |
| Shared schedules | `packages/core/src/calendar/index.ts`, `packages/core/src/schedule-import/`, `packages/core/src/planner/time.ts` |
| Shared profile / metrics | `packages/core/src/profile/`, `packages/core/src/analytics.ts` |
| Parse/apply API | `src/app/api/mobile/schedule/import/parse/route.ts`, `src/app/api/mobile/schedule/import/apply/route.ts`, `src/lib/schedule/import.ts` |
| Account/profile API | `src/app/api/mobile/profile/route.ts`, `src/app/api/mobile/account/manage/route.ts`, `src/app/api/mobile/account/route.ts`, `src/lib/supabase/verify-password.ts` |
| Calendar/planner server | `src/app/api/mobile/calendar/route.ts`, `src/lib/planner/plan-today.ts` |
| Web UI | `src/app/calendar/import/page.tsx`, `src/components/schedule-import-panel.tsx`, `src/app/profile/page.tsx`, `src/components/profile-panel.tsx`, `src/app/calendar/local/page.tsx`, `src/app/onboarding/schedule/schedule-calendar.tsx` |
| Mobile UI | `mobile/components/ScheduleImportScreen.tsx`, `ProfileFields.tsx`, `MoreMenuScreen.tsx`, `MobileAppShell.tsx`, `CalendarScreen.tsx`, `CalendarEventModal.tsx`, `WeeklyScheduleGrid.tsx`, `mobile/App.tsx` |
| Mobile integration | `mobile/lib/account-schedule-api.ts`, `mobile/lib/api.ts`, `mobile/lib/calendar-view.ts`, `mobile/lib/syllabus-files.ts` |
| Schema | `supabase/migrations/20261019204801_schedule_import_and_profile.sql` |

The migration adds profile/scheduling columns, duration/date constraints, invoker functions `schedule_items_overlap` and `apply_schedule_import`, and authenticated execution permissions. It preserves ownership policies. Do not edit this already-applied migration to make later changes; create another migration.

## 5. Verification completed

These results come from the implementation/release session; this documentation-only task did not rerun the full suite.

- **305 automated tests passed** across the regression suite.
- Lint passed without warnings; web production build passed.
- Mobile TypeScript passed; Expo Doctor **18/18 checks passed** after patching dependencies within SDK 54 (`expo ~54.0.37`, `expo-file-system ~19.0.24`).
- Tests cover mixed/ambiguous drafts, missing information, upload rejection, confirmed ranges and ongoing recurrence, duplicate detection, overlaps, overnight tails, month/week boundaries, DST wall-clock behavior, timezone date selection, API authentication, and deletion password requirements.
- Disposable-account integration checks exercised real profile persistence, mixed imports, repeat/concurrent imports, atomic rollback, explicit overlap acceptance, cross-user RLS isolation, incorrect/current-password handling, password changes and new-password sign-in, account deletion, and Gemini extraction from PDF and PNG fixtures.
- Signed-in local production web flow verified Profile save, PDF upload/review/apply, calendar rendering, and editing the original overnight shift from its second displayed portion.
- Production smoke checks verified saved Profile, Calendar API, duplicate-safe import, unauthorized rejection, legacy Settings redirect, and account deletion.
- Both disposable QA accounts were deleted and deletion was verified. Do not reuse their old credentials or tokens.
- Vercel's post-release error/fatal log scan returned no matching logs for the inspected window; this is a point-in-time check, not continuous monitoring.
- Supabase security advisors showed preexisting warnings (mutable search path for `set_updated_at`, GraphQL exposure warnings, leaked-password protection disabled), with no new advisor finding attributed to this migration. These findings remain follow-up work rather than evidence that every security concern is resolved.
- EAS iOS production build 13 completed successfully. Native runtime behavior still requires device testing.

Ignored `.superpowers/schedule-profile-qa/` contains local QA scripts/fixtures and may contain expired test-session material. It is scratch space, not a reproducible public test package; do not commit or publish its authentication files. `.superpowers/` and `.claude/` scratch/worktree paths are excluded from normal lint/test discovery to prevent duplicate scans.

## 6. Remaining work, in priority order

### A. Physical iPhone acceptance testing

Use an installed development/standalone build or TestFlight build; Expo Go does not validate the production `atlas://` callback flow. Build 13 is store distribution, so arrange the appropriate distribution path before installation.

- [ ] Upload a PDF, pick an image, and take a camera photo; verify compression, cancellation, denied permissions, oversized/invalid files, unreadable documents, retry, and manual fallback.
- [ ] Verify review editing, keyboard/scroll behavior, exclusions, confirmed term dates, Ongoing, mixed repeating/dated entries, duplicate counts, and overlap acceptance.
- [ ] Verify overnight shifts at week/month boundaries and around DST; check both display portions, original-item editing/deletion, and planner occupancy.
- [ ] Verify cross-platform Profile persistence, incorrect current password, password change and fresh login, sign-out, and destructive account deletion.
- [ ] Verify actual email-change confirmation and password-recovery links on the same iPhone, including the Supabase redirect allow-list and `atlas://auth/callback` handling. These outbound-email/device flows were not completed in automated/live QA.
- [ ] Verify system/light/dark appearance and native exam reminders, permission handling, and notification controls.
- [ ] Check iPad layout too, because `supportsTablet: true`.

### B. App Store/TestFlight release

- [ ] Review current App Store Connect state; this session built the IPA but did not submit it.
- [ ] Reconcile `mobile/APP_STORE_LISTING.md` with the implemented Schedule import/Profile flows and real account settings. Its “missing” checklist is historical and must be verified item by item; for example, existing Apple credentials were sufficient to build successfully.
- [ ] Capture real iPhone/iPad screenshots, validate the 1024px marketing icon, and prepare an App Review demo account with representative data.
- [ ] Confirm App Store Connect app IDs/submit configuration, support channel, privacy answers, and production URLs.
- [ ] Confirm production auth redirects and analytics/crash configuration. Integrations are optional and stay disabled when unconfigured; a successful build alone does not prove telemetry is enabled.
- [ ] Submit/distribute the validated build through the chosen App Store Connect workflow.
- [ ] If Android is a release target, configure package/signing, build it, and perform Android-specific permission/UI/auth checks.

### C. Documentation, limitations, and technical debt

- [ ] Refresh `roadmap.md` and `MVP_SLICE.md`: they describe earlier scopes and defer features now present. Google/external calendar linking is not part of the current local-calendar release.
- [ ] Update App Store copy referring to Settings/More, stale domain placeholders, schedule import capabilities, and profile data disclosures. `mobile/PRODUCTION_ANALYTICS.md` also predates the new import events.
- [ ] Review schedules that explicitly declare a timezone different from Profile. Current behavior uses the profile timezone and has no automatic cross-zone conversion.
- [ ] Review the preexisting Supabase advisor warnings deliberately; make schema fixes through new migrations and assess compatibility before changing GraphQL exposure.
- [ ] Review dependency audit findings separately. No broad dependency/security upgrade was attempted as part of this feature release.
- [ ] Finish the older mobile API-boundary cleanup: some onboarding/wellness calls still use web-internal routes. Existing contract tests mitigate this; new Schedule/Profile work uses `/api/mobile/*`.
- [ ] Reconcile the preserved stash and old worktrees only after inspecting their diffs. Do not treat old branch names as a feature backlog.
- [ ] Review core-loop metric coverage, including plan acceptance, against the product checklist. New import metrics were added; a complete analytics coverage audit was not performed.

Explicitly deferred by the approved feature plan: avatars, data export, replacing/removing prior import batches, external calendar sync, browser push notifications, and automatically creating courses/assignments from a schedule upload. Syllabus import remains the separate course-creation flow.

## 7. Development and release workflow

From repo root, use `npm install`/`npm ci` as appropriate, then `npm run dev`. Run mobile separately from `mobile/` with its dependencies installed and `npm run start`. The mobile API base must point to the desired web/API environment.

Verification commands:

```powershell
# Repository root
npm.cmd test
npm.cmd run lint
npm.cmd run build

# mobile/
node node_modules/typescript/bin/tsc --noEmit --pretty false
npx.cmd expo-doctor
```

Future schema/release sequence: add backward-compatible CLI migration, review and apply it to the intended linked project, run checks, push reviewed application changes, inspect the automatic Vercel deployment/production alias, run signed-in smoke tests, then build and validate the native app. Rollbacks of app code do not automatically undo database migrations.

Environment configuration lives outside this handoff. Web uses `.env.local` / Vercel settings; native uses mobile env files / EAS environments. Required capabilities include Supabase public URL/anon key, server-only service-role key for deletion, and server-only Gemini key for parsing. Native uses `EXPO_PUBLIC_API_BASE_URL`, Supabase public configuration, website URL, and auth redirect configuration. Never copy server secrets into public/native variables or handoff files.

## 8. Supporting documents

- [README](README.md): setup, routes, capabilities.
- [Root project instructions](AGENTS.md) and [mobile instructions](mobile/AGENTS.md): working constraints.
- [Schedule/Profile release details](docs/schedule-profile-release.md): implementation behavior and original release checklist.
- [App Store listing and submission checklist](mobile/APP_STORE_LISTING.md).
- [App Store URLs](mobile/APP_STORE_METADATA.md).
- [Native authentication and device tests](mobile/PRODUCTION_AUTH.md).
- [Production analytics](mobile/PRODUCTION_ANALYTICS.md).
- [Roadmap](roadmap.md) and [original MVP slice](MVP_SLICE.md): historical direction, pending refresh.
- `docs/superpowers/specs/` and `docs/superpowers/plans/`: historical Courses design/plans; their old unchecked steps do not establish that code is missing today.

**Recommended next action:** complete physical-device acceptance and reconcile the App Store submission package before adding another feature area.

