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
- Create a **Private** Blob store and connect it to the project. Vercel supplies `BLOB_STORE_ID` and authenticates deployments with an automatically rotated OIDC token; do not create a long-lived Blob write token.
- Set production `NEXT_PUBLIC_APP_URL` to the final HTTPS application URL.

The current slice includes Google OAuth entry/callback routes, cookie-backed Supabase sessions, a protected dashboard, a health endpoint, and the initial relational schema. Upload-token issuance is intentionally deferred until project/invitation authorization is implemented.
