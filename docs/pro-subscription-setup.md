# Atlas Pro setup checklist

Atlas Pro is built and wired behind env keys. Until the steps below are done, nothing changes for
students: the paywall says "Pro is coming soon", no purchase buttons show, and syllabus imports are
not limited (`PRO_ENFORCE_LIMITS` defaults off).

**What Pro is:** unlimited syllabus imports and a "Pro · Supporting Atlas" badge on the profile.
Free accounts get 3 syllabus imports per term. Everything else (Today plan, calendar, courses and
grades, study timer, GPA, LMS feed) stays free.

**Prices:** $3.99 / month or $24.99 / year (set the real prices in Stripe and the stores; the app
shows the store's localized price on mobile and these defaults on web).

**Term:** the free limit resets on Jan 1, May 1 and Sep 1 in the student's profile timezone
(Winter / Summer / Fall). Course `term` text is optional and editable during import, so it is not
used for counting. Every successful syllabus import is logged in `syllabus_imports`, even while
limits are off, so counts are already right on the day the limit is turned on.

## 1. Database

- [ ] Apply `supabase/migrations/20261020210000_pro_subscription.sql` with `supabase db push`
      (adds `user_entitlements`, `syllabus_imports`, `billing_webhook_events`).
- [ ] Make sure `SUPABASE_SERVICE_ROLE_KEY` is set on the web host; the webhooks write entitlements
      with it (students can only read their own row).

## 2. Stripe (web)

- [ ] Create a product "Atlas Pro" with two recurring prices: $3.99 monthly and $24.99 yearly.
      Copy the price ids into `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_YEARLY`.
- [ ] Copy the secret key into `STRIPE_SECRET_KEY`.
- [ ] Check `NEXT_PUBLIC_SITE_URL` is the public https origin of the web app (for example
      `https://atlas.example.com`): Checkout's success/cancel pages and the portal's return link are
      built from it, and the default `http://localhost:3000` would send buyers to a dead page.
- [ ] Settings → Billing → Customer portal: turn it on (allow cancel, update payment method, and
      switching between the two prices).
- [ ] Developers → Webhooks → add endpoint `https://<your site>/api/webhooks/stripe` with events
      `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
      Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
- [ ] Test mode first: buy with card 4242 4242 4242 4242 on `/pro`, check the badge appears, then
      cancel in "Manage billing" and check the status reads "ends …".

## 3. App Store Connect and Google Play

- [ ] App Store Connect: subscription group "Atlas Pro" with auto-renewable products
      `atlas_pro_monthly` ($3.99) and `atlas_pro_yearly` ($24.99). Fill in the review screenshot and
      description, and add the App Store Connect API key / in-app purchase key in RevenueCat.
- [ ] Google Play Console: subscriptions `atlas_pro_monthly` and `atlas_pro_yearly` with one base
      plan each; link the Play service account in RevenueCat.
- [ ] Product ids should contain "month" / "year" (or "annual"): the server reads the plan from them.

## 4. RevenueCat (mobile)

- [ ] Create a project with the iOS and Android apps (bundle id `com.personalagent.atlas`).
- [ ] Entitlement with identifier `pro` (or set `REVENUECAT_ENTITLEMENT_ID`), attach both products
      on both stores.
- [ ] Offering "default" (current) with the Monthly and Annual packages.
- [ ] Integrations → Webhooks: URL `https://<your site>/api/webhooks/revenuecat`, Authorization header
      a long random secret; put the same value in `REVENUECAT_WEBHOOK_AUTH`.
- [ ] Copy the public SDK keys into the mobile env: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (appl_…)
      and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` (goog_…).
- [ ] Leave "Restore behavior" at the default (transfer to new App User ID). Transfer events are
      acknowledged but not applied, so a restore on a different Atlas account tells the student the
      purchase belongs to another account and points them to support; move it by hand if asked.
- [ ] The app logs in to RevenueCat with the Supabase user id, so webhook `app_user_id` is the
      student's id. Anonymous ids are ignored.

## 5. New mobile build

- [ ] `react-native-purchases` is a native module: make a new EAS build (`eas build`) for both
      platforms. OTA updates alone won't include it; older builds keep showing "Pro is coming soon"
      because the module is loaded lazily and fails soft.
- [ ] Test with a sandbox (iOS) / license tester (Android) account: buy, see the badge after the
      webhook lands, and try "Restore purchases" on a reinstall. Sandbox events are ignored unless
      `REVENUECAT_ALLOW_SANDBOX=true`, so test against a staging/preview host with that set (never
      production: TestFlight purchases are free).

## 6. Turn on the limit

- [ ] Only after web and mobile purchases both work: set `PRO_ENFORCE_LIMITS=true` on the web host.
      Free students who have used 3 imports this term then get a 402 `syllabus_import_limit` from
      `/api/courses/{parse,apply}` (and the `/api/mobile/...` copies), shown as an upgrade prompt on
      both surfaces. They can still add courses by hand.

## Env vars

| Var | Where | Purpose |
|---|---|---|
| `PRO_ENFORCE_LIMITS` | web | `true` enforces 3 free imports per term (default off) |
| `STRIPE_SECRET_KEY` | web (server) | Checkout, portal, reading subscriptions |
| `STRIPE_WEBHOOK_SECRET` | web (server) | Verifies `Stripe-Signature` |
| `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` | web (server) | Price ids for checkout and plan mapping |
| `REVENUECAT_WEBHOOK_AUTH` | web (server) | Expected `Authorization` header from RevenueCat |
| `REVENUECAT_ENTITLEMENT_ID` | web (server) | RevenueCat entitlement id (default `pro`) |
| `REVENUECAT_ALLOW_SANDBOX` | web (server) | `true` lets sandbox purchases grant Pro (staging only; default off) |
| `NEXT_PUBLIC_SITE_URL` | web | Public origin for Checkout success/cancel and portal return links (already used for auth emails) |
| `SUPABASE_SERVICE_ROLE_KEY` | web (server) | Webhooks write entitlements (already used for account deletion) |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | mobile | RevenueCat public SDK key (iOS) |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | mobile | RevenueCat public SDK key (Android) |

## How it fits together

- `GET /api/mobile/subscription` is the source of truth for both surfaces: `isPro`, the stored
  entitlement, this term's import usage, `limitsEnforced`, and whether web checkout / portal exist.
- Web: `/pro` page → `POST /api/billing/checkout { plan }` (Stripe Checkout) and
  `POST /api/billing/portal`. The Stripe webhook grants Pro; the page refreshes until it does.
- Mobile: Profile → Atlas Pro (or "See Atlas Pro" when an import is blocked) → store purchase via
  RevenueCat → the app re-reads `/api/mobile/subscription` until the RevenueCat webhook lands.
- Webhooks are idempotent on event id (`billing_webhook_events`), ignore events older than the last
  one applied, and an event from one store only replaces an active subscription from the other when
  it is better (the existing one is canceled and the new one renews, or the new one runs later and
  isn't itself canceled). Stripe events only count for the two Pro price ids, RevenueCat events only
  when they name the Pro entitlement. Checkout answers 409 for a student who is already Pro.
