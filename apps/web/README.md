# QAWELL web application

The Vercel-hosted control plane for QAWELL. The browser capture utility remains published separately from the repository root through GitHub Pages.

## Local setup

1. Create a Supabase project.
2. Enable the Google provider in Supabase Auth.
3. Add `http://localhost:3000/auth/callback` and the eventual Vercel callback URL to the allowed redirects.
4. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key.
5. Apply `supabase/migrations/202609280001_initial_platform.sql` in the Supabase SQL editor or CLI.
6. Run `npm run dev`.

## Vercel setup

- Import `jscarpelli3/qa-capture`.
- Set **Root Directory** to `apps/web`.
- Add `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in every required environment.
- Add `SUPABASE_SECRET_KEY` as a server-only Vercel secret using the current `sb_secret_...` key. It stores and reads encrypted integration credentials; never prefix it with `NEXT_PUBLIC_`.
- Add `QAWELL_CREDENTIAL_ENCRYPTION_KEY` as a server-only Vercel secret containing 64 hexadecimal characters. Generate it with `openssl rand -hex 32` and do not rotate it without re-encrypting stored credentials.
- Create a **Private** Blob store and connect it to the project. Vercel supplies `BLOB_STORE_ID` and authenticates deployments with an automatically rotated OIDC token; do not create a long-lived Blob write token.
- Set production `NEXT_PUBLIC_APP_URL` to the final HTTPS application URL.

## Invitation email

Invitation delivery currently defaults to manual: QAWELL creates the invitation and displays its private link for the project owner to copy and send. Keep `QAWELL_EMAIL_DELIVERY=manual` (or leave it unset) for this behavior.

The Resend integration is scaffolded but disabled. To enable it later:

1. Add and verify the sending domain in Resend.
2. Add the server-only Vercel secret `RESEND_API_KEY`.
3. Set `QAWELL_INVITE_FROM` to a sender on the verified domain, such as `QAWELL <reviews@qawell.dev>`.
4. Set `QAWELL_EMAIL_DELIVERY=resend`.

Never prefix the Resend API key with `NEXT_PUBLIC_`. When enabled, invitation creation sends plain-text and HTML versions and uses an idempotency key to guard against duplicate API requests.

The current slice includes Google OAuth entry/callback routes, cookie-backed Supabase sessions, a protected dashboard, a health endpoint, and the initial relational schema. Upload-token issuance is intentionally deferred until project/invitation authorization is implemented.
