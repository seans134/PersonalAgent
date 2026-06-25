# Production authentication

The native callback URL is:

```text
atlas://auth/callback
```

Before testing confirmation or password recovery in a development/production build:

1. Open the Supabase dashboard for this project.
2. Go to Authentication, then URL Configuration.
3. Add `atlas://auth/callback` to Redirect URLs.
4. Keep the deployed web callback URLs in the same allow-list.
5. Set `EXPO_PUBLIC_AUTH_REDIRECT_URL=atlas://auth/callback` in the EAS build environment.

The custom `atlas://` scheme is configured in `app.json`. Test it with an EAS development build or standalone build; Expo Go does not register the production custom scheme as the installed Atlas app.

Never place the Supabase service-role key or `GEMINI_API_KEY` in the mobile environment.

## Physical-device tests

These tests require an EAS development or standalone build because Expo Go does not own the `atlas://` scheme.

1. Create a new account with an email address that has not been confirmed.
2. Open the confirmation email on the same iPhone and tap the link.
3. Confirm Atlas opens and the user reaches the signed-in dashboard.
4. Sign out, enter the same email, and tap **Forgot password?**
5. Open the recovery email on the iPhone and tap the link.
6. Confirm Atlas opens the native password form.
7. Set a new password, sign out, and sign back in with it.
