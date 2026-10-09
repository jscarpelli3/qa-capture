# QAWELL current-state handoff

Last updated: October 9, 2026  
Repository: `git@github.com:jscarpelli3/qa-capture.git`  
Production: `https://qawell.dev`  
Vercel root directory: `apps/web`

## Current outcome

QAWELL is usable for real internal website QA with Agency Brain:

1. A developer signs in with Google and creates a project.
2. The developer verifies the staging origin and installs the project-specific script served from `https://qawell.dev/capture.js`.
3. The developer connects an Agency Brain project using a server-side encrypted API key.
4. The developer creates a reviewer invitation and manually copies its private link. Email delivery is scaffolded but disabled.
5. The invited reviewer captures notes across pages and submits the pass.
6. QAWELL validates and retains the canonical ZIP in private Vercel Blob storage.
7. Each note becomes an Agency Brain QA ticket.
8. The developer can inspect the note-to-ticket map and download an AI-ready enriched ZIP from the project dashboard.

The Agency Brain flow has succeeded end to end in production. Concurrent/multiple-reviewer behavior has been hardened in code but has not received the planned manual multi-browser test matrix.

## AI-ready review packages

Completed passes appear under **Review packages** on the project dashboard. Each package exposes delivery counts, an expandable ticket map, and an authenticated download.

The downloaded ZIP contains:

- `manifest.json`
- `review.json` with reviewer feedback and captured browser/DOM/CSS/diagnostic context
- optional reviewer-supplied image assets
- `delivery-map.json` generated from current server delivery records at download time

The correlation rule is embedded in the map:

```text
delivery-map.json deliveries[].noteId = review.json notes[].id
```

Each delivery includes the QAWELL integration ID, provider, external project ID/name, delivery state, Agency Brain ticket UUID and display label, timestamps, and any normalized error code. Existing retained reviews receive the newest delivery map when downloaded; source ZIPs do not need to be resubmitted.

The strict aggregate parser now accepts and validates enriched packages. It rejects delivery maps that reference nonexistent or duplicate note IDs.

## Integration architecture

Review ingestion calls the provider-neutral dispatcher in:

```text
apps/web/src/lib/delivery-adapters/deliver-review.ts
```

Provider types and display metadata live beside it. Agency Brain is the only live adapter. Sifter and Asana are registered as planned providers but make no network calls.

The current product deliberately permits zero or one active delivery destination per project. Migration `202610020002_add_asana_provider.sql` adds the Asana enum value and a partial unique index enforcing that rule. The user confirmed this migration was applied in production.

See `docs/integration-adapter-contract.md` for the required adapter behavior. In brief, every new adapter must handle server-only credentials, external project selection, one record per note, retry reconciliation/idempotency, normalized errors, and persistent external IDs.

### Agency Brain

- Live and production-tested.
- Credentials are encrypted at rest by QAWELL.
- Requires `qa:create` and `qa:read` because creation and retry reconciliation both run.
- Ticket descriptions contain stable QAWELL review/note references.
- Delivery first checks local delivery state and then searches existing Agency Brain tickets before creating another.
- Agency Brain does not currently provide a documented browser URL pattern in its external API, so the map contains the authoritative ticket UUID and `QA #…` label with `url: null`.

### Asana

- Enum, catalog entry, and adapter boundary exist; connection and delivery are not implemented.
- Recommended next implementation uses OAuth authorization-code flow, encrypted refresh tokens, project selection, and task read/write scopes.

### Sifter

- Catalog entry and adapter boundary exist; connection and delivery are not implemented.
- Confirm API write-access availability with Sifter before investing in the connection UI. Its API documentation described write access as restricted/private beta when last reviewed.

## Persistence and security

- Supabase stores organizations, membership, projects, verified origins, invitations, reviews, integrations, encrypted credential records, and per-note delivery records.
- Vercel Blob stores approved ZIPs privately. Dashboard downloads require an authenticated project member.
- Integration secrets are never returned to the widget or stored in review archives.
- The upload pipeline limits archive size, validates ZIP structure and paths, validates image signatures, constrains captured content, and requires every captured page to match the project's verified origin.
- Invitations are claimed atomically. Session storage is namespaced per QAWELL project. Rotating or deleting an invitation invalidates unsubmitted `created` reviews.
- Reviewer-supplied screenshots are optional. Automatic DOM screenshots were intentionally removed because cross-origin resources made them unreliable.

## Production configuration

Required public configuration:

- `NEXT_PUBLIC_APP_URL=https://qawell.dev`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Required server-only configuration:

- `SUPABASE_SECRET_KEY`
- `QAWELL_CREDENTIAL_ENCRYPTION_KEY` — exactly 64 hexadecimal characters
- Vercel private Blob connection (`BLOB_STORE_ID` plus Vercel-managed OIDC authentication)

Optional email configuration, currently not enabled:

- `QAWELL_EMAIL_DELIVERY=resend`
- `RESEND_API_KEY`
- `QAWELL_INVITE_FROM`

Never add `NEXT_PUBLIC_` to a secret.

## Database migrations

Migration files, in order:

1. `202609280001_initial_platform.sql`
2. `202610010001_project_setup.sql`
3. `202610010002_review_ingest.sql`
4. `202610020001_manual_invitation_status.sql`
5. `202610020002_add_asana_provider.sql`

All five were reported as applied to the production Supabase project.

## Known limitations and operational rules

- Invitation email is manual. The UI prints a copyable invitation link and does not falsely claim an email was sent.
- Integration delivery is synchronous and sequential inside the upload request.
- Agency Brain allows 30 ticket creations per minute per API key. Keep internal passes reasonably small and avoid simultaneous large submissions until queue-backed delivery exists.
- A partially delivered pass can become `delivery_failed`; successfully created note deliveries remain recorded and are reconciled before another creation attempt.
- The production multi-reviewer/concurrency matrix remains untested manually.
- There is no payment system, public onboarding polish, account deletion workflow, or formal operational monitoring yet.
- Sifter and Asana UI cards are informational only.

See `docs/launch-readiness-audit-2026-10-02.md` for the fuller risk audit.

## Recommended next work

The best next concrete engineering sequence is:

1. Add administrator-visible per-note retry/error controls for integration failures.
2. Move external delivery behind a durable queue and honor Agency Brain `429` retry timing.
3. Add structured server monitoring for ingestion, Blob retention, and provider failures.
4. Implement Asana OAuth, external project selection, and the Asana delivery adapter.
5. Verify Sifter write access, then implement its token/account connection flow and adapter.
6. Enable Resend only after the sending domain and production email copy are ready.
7. When bandwidth permits, run the concurrency matrix from the launch audit with two invitations, browsers, and simultaneous submissions.

Do not begin by changing archive capture. The current data package and Agency Brain mapping are functional; reliability and additional destinations are the higher-value next steps.

## Verification commands

Run from the repository root unless noted:

```bash
node --test packages/qa-aggregate/test/*.test.mjs
git diff --check
```

Run from `apps/web`:

```bash
npm run lint
npm run build
```

At the time of this handoff, lint, the Next.js production build, and all eight archive tests passed.

## Recent checkpoints

- `97105db` — AI-ready retained packages and visible note-to-ticket mapping
- `1611426` — provider-neutral delivery adapter boundary; Asana/Sifter planning
- `306fb5e` — dashboard delivery counts
- `d00c524` — Agency Brain reconciliation before ticket creation
- `817b308` — concurrent-session hardening
- `a9a9a69` — launch/readiness audit
- `8317717` — private retained packages and enriched downloads
