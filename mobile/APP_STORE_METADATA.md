# App Store URLs

After deploying the web app, use these public HTTPS pages in App Store Connect:

- Privacy Policy URL: `https://YOUR_DOMAIN/privacy`
- Support URL: `https://YOUR_DOMAIN/support`
- Terms of Use: `https://YOUR_DOMAIN/terms`

Set `EXPO_PUBLIC_WEBSITE_URL=https://YOUR_DOMAIN` for mobile builds. Optionally set `NEXT_PUBLIC_SUPPORT_EMAIL` on the web deployment; otherwise the support page links to the Atlas issue tracker.

Account deletion requires `SUPABASE_SERVICE_ROLE_KEY` on the server deployment. Never expose that key through an `EXPO_PUBLIC_` or `NEXT_PUBLIC_` variable.
