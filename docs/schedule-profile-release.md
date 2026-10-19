# Schedule uploads and Profile

## Behavior

Web and mobile use `/api/mobile/schedule/import/parse` (multipart, one PDF/image up to 4 MiB) and `/apply` (reviewed JSON). Parsing uses the existing Gemini key and retains no uploaded file. Mobile offers PDF/image selection, photo library, and camera capture. A missing AI configuration does not prevent manual entries.

Review includes editable dates/times, explicit ongoing recurrence, next-day endings, inclusion controls, duplicate/overlap notices, and a seven-day preview. Save requires explicit date/time review and a separate overlap opt-in. An import adds commitments; it never replaces previous imports or creates courses.

`apply_schedule_import` runs as the authenticated caller, takes a per-user transaction lock, checks existing rows under RLS, skips exact duplicates, and rolls back the complete request if a row fails. The maximum request contains 200 entries. Schedule timezone must match Profile. Changing Profile timezone preserves entered schedule wall-clock times.

Shared calendar occurrence expansion honors inclusive recurrence date bounds and clips overnight shifts at midnight without changing their source identity. Edits and deletion affect the original item. The planner fetches the previous day's dated events as well as today and determines the date using the profile timezone.

Profile replaces mobile More while preserving secondary navigation. `/api/mobile/profile` provides shared profile reads/updates. `/api/mobile/account/manage` handles password changes, confirmed email changes, and recovery. Password/email changes verify the current password with an isolated Supabase session. Account deletion also requires password verification and `DELETE` confirmation. Credentials and upload content are excluded from analytics.

Appearance stays local to the device. Existing local notifications remain configured through the mobile Profile menu; web explains where to manage them. Legacy `/settings` links redirect to `/profile`.

## Deployment

1. Apply `supabase/migrations/20261019204801_schedule_import_and_profile.sql` using the linked Supabase CLI (`supabase db push --skip-vault`). The migration is additive except for replacing same-day time checks with equivalent checks that also allow an explicit next-day ending.
2. Run tests, lint, production build, mobile TypeScript, and Expo Doctor.
3. Deploy the commit to Vercel production.
4. Build the existing iOS app using the EAS production profile. Native permission-copy and system-appearance changes require a new binary. Android signing/package configuration is not currently configured in this repository.

## Verification

Automated tests cover mixed and ambiguous drafts, bounds, exact duplicates, overlaps, overnight tails, DST wall times, timezone date selection, profile validation, API auth, review confirmation, and password-protected deletion.

Disposable-account integration checks cover actual profile persistence, mixed imports, repeated/concurrent imports, atomic rollback, explicit overlap acceptance, cross-user RLS, password changes, account deletion, and Gemini extraction from PDF and PNG fixtures. The signed-in browser flow covers Profile save, PDF upload/review/apply, calendar rendering, and editing the second portion of an overnight shift.

Before App Store submission, install the new build on an iPhone and verify camera/photo/PDF picking, permission denial/cancel, keyboard scrolling, Profile save/password changes, confirmation/recovery links, and notification settings. No physical device is connected to this Windows workspace, so those checks cannot be represented as completed here.
