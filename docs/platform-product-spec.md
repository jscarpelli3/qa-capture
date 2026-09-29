# QAWELL Platform Product Specification

Status: Draft for staged implementation  
Date: 2026-09-27  
Related specifications:

- [`archive-format.md`](archive-format.md)
- [`hosted-relay-spec.md`](hosted-relay-spec.md)
- [`aggregator-spec.md`](aggregator-spec.md)
- [`installing-capture.md`](installing-capture.md)

## 1. Product definition

QAWELL lets a developer install a review widget on a staging or preview site, invite specific reviewers by email, and receive structured, verified review sessions. Reviewers annotate the live site without creating an account first. They verify their invited Google identity only when they send the finished review.

The service stores a validated canonical ZIP for every accepted review and optionally renders or delivers that review to configured destinations.

One sentence:

> Install one script, invite a reviewer, and receive their contextual QA notes as a verified, portable review package or downstream tickets.

## 2. Product boundaries

QAWELL owns:

- Project setup and installation instructions
- Reviewer invitations
- Browser-based contextual capture
- Reviewer identity verification at submission
- Secure review ingestion and validation
- Canonical review archives
- Rendering into human- and machine-oriented formats
- Delivery to configured integrations
- Delivery audit history and retries

QAWELL does not initially own:

- General project management
- Ticket status and assignment workflows
- Client relationship management
- Source-code changes
- Production deployment
- Authentication or access control for the reviewed staging site
- Long-term document management beyond configured retention

## 3. Roles

### Organization owner

- Creates the organization
- Manages billing and retention
- Manages administrators
- Can access all organization projects and reviews

### Project administrator

- Creates and configures projects
- Registers allowed origins
- Installs the capture script
- Creates and revokes invitations
- Connects integrations
- Downloads and redelivers approved reviews

### Reviewer

- Receives a project-scoped invitation
- Accesses the staging site using instructions supplied by the developer
- Creates notes locally
- Verifies the invited Google identity when sending
- Sees submission confirmation
- Cannot browse project settings or other reviews unless separately made an organization member

### Integration worker

- Reads approved canonical packages
- Produces rendered outputs
- Delivers outputs to preconfigured destinations
- Has no interactive user identity

## 4. System components

```text
Public capture distribution
├── Versioned browser script
├── Bookmarklet
├── npm package (later)
└── WordPress plugin (later)

QAWELL application
├── Google-authenticated developer dashboard
├── Project and origin configuration
├── Invitation creation and email delivery
├── Reviewer verification popup
├── Review status and download UI
└── Integration configuration

Trusted backend
├── Authorization and handoff codes
├── Private Blob upload broker
├── Validation and canonicalization workers
├── Renderer workers
├── Delivery adapters
└── Audit and retry processing

Storage
├── Relational metadata database
├── Private quarantine Blob store
└── Private approved Blob store
```

Recommended initial infrastructure:

- Vercel-hosted web application and API
- Google OpenID Connect for identity
- Supabase Postgres for relational metadata
- Private Vercel Blob for archives and rendered files
- Vercel Functions for initial processing
- Durable queue when asynchronous delivery is introduced

## 5. Developer onboarding

### 5.1 Sign up

The developer selects **Continue with Google**. The backend verifies Google identity and creates or joins an organization.

Required initial profile fields:

- Display name
- Verified email
- Organization name
- Timezone

Google authentication grants no access to Google Drive. Drive is a separate integration authorization flow with separate consent.

### 5.2 Create project

Required fields:

- Project name
- Primary staging URL
- Allowed origin derived from the URL

Optional fields:

- Client name
- Environment label
- Default invitation lifetime
- Default review limit per invitation
- Retention period

The server generates:

- Internal project ID
- Public installation key
- Installation snippets
- Project signing/delivery configuration

### 5.3 Install capture script

The dashboard supplies a version-pinned script tag:

```html
<script
  src="https://cdn.qacapture.example/releases/1.0.0/capture.js"
  integrity="sha384-..."
  crossorigin="anonymous"
  data-project="pk_project_abc">
</script>
```

The public key identifies configuration but authorizes no review submission.

Installation options:

- Versioned remote script tag
- npm package
- WordPress plugin or enqueue snippet
- Bookmarklet for trials
- Self-hosted immutable script

The dashboard explains preview-only configuration and CSP requirements.

### 5.4 Verify origin ownership

Before invitations can be sent, the developer must prove control of the configured origin using one of:

- Successful request from the installed project script plus an administrative confirmation
- Project-specific meta tag
- `/.well-known/qa-capture-verification` file
- DNS TXT record

The exact first-release mechanism may be the project-specific script verification. Verification prevents a customer from creating invitations that misleadingly claim affiliation with an unrelated site.

## 6. Invitations

### 6.1 Create invitation

Required:

- Project
- Reviewer email
- Staging URL under an allowed origin

Optional:

- Reviewer name
- Personal message
- Deadline
- Expiration time
- Maximum accepted reviews
- General access instructions
- Estimated review time
- Requested pages or scope

Do not provide a normal plaintext site-password field in the first release. Access instructions may link to a customer-managed secure-sharing system. If secret sharing is later added, it requires separate encryption, short-lived/view-once retrieval, access logging, and deletion.

### 6.2 Invitation identity

Each invitation has:

- Opaque internal ID
- 256-bit random invitation secret
- Server-side secret hash
- Project and exact invited email
- Allowed origin
- Expiration
- Maximum review count
- Status and audit timestamps

The invitation link places its secret in the URL fragment:

```text
https://staging.example.com/#qa-invite=<random-secret>
```

The fragment is not sent to the staging server in the initial HTTP request. The widget exchanges it with QAWELL and removes it from the visible URL.

### 6.3 Invitation statuses

```text
draft
queued
sent
opened
started
submitted
partially_used
exhausted
expired
revoked
delivery_failed
```

`delivery_failed` refers to the invitation email, not review integrations.

### 6.4 Email contents

The transactional email includes:

- Inviting organization and project
- Reviewer name when known
- Staging URL
- Personal message
- Review scope/instructions
- Deadline and invitation expiration
- Start-review button
- Support contact
- Privacy summary

It must not include downstream integration credentials or QAWELL administrative access.

## 7. Reviewer activation and local capture

### 7.1 Opening an invitation

The widget exchanges the invitation secret for a provisional session. The response contains:

- Provisional review ID
- Masked expected email
- Project display name
- Review scope and instructions
- Session expiration
- Restricted draft capability

The interface displays:

```text
You were invited to review Client Website
Invited account: j•••@example.com
[Start review]
```

The full invited email should be shown only when disclosure is appropriate; masking is the safer default on a shared screen.

### 7.2 Draft authorization

Possession of the invitation permits only:

- Creating one provisional review session
- Reading that invitation's non-sensitive display configuration
- Optionally uploading a constrained private draft backup

It does not permit:

- Final submission
- Integration delivery
- Reading other reviews
- Reading reviewer lists
- Changing project settings

### 7.3 Local persistence

The hosted capture version stores structured notes and image Blobs in IndexedDB. `sessionStorage` stores only a small pointer to the active review session.

Requirements:

- Persist immediately after each note create, update, or delete
- Restore after same-origin navigation and refresh
- Preserve work while an authentication popup is open
- Never clear before server acceptance
- Validate locally stored data again when restored
- Provide a visible local-storage failure warning
- Provide a discard action with confirmation

The existing prototype uses `sessionStorage`; IndexedDB migration is required before the hosted release.

### 7.4 Optional draft backup

An invitation may allow one encrypted or private draft upload with strict byte and frequency limits. A draft:

- Lives only in private quarantine
- Cannot be delivered
- Is automatically deleted if never verified
- Is tied to one invitation and provisional review ID
- Does not count as an accepted review

This is a later resilience feature. Local IndexedDB persistence is required first.

## 8. Finishing and Google verification

### 8.1 Finish screen

The reviewer sees:

```text
12 notes ready to send
You will verify j•••@example.com before submission.

[Verify and send]
```

The default hosted product does not present direct ZIP download to the reviewer. Project administrators can download approved ZIPs from the dashboard.

An emergency **Save recovery copy** action may appear only after repeated submission failure. It should be framed as recovery rather than the primary workflow.

### 8.2 Popup flow

The reviewed staging page must never navigate to Google.

1. A user click opens a first-party popup on the QAWELL application origin.
2. QAWELL requests Google account selection.
3. The backend completes the authorization-code flow and verifies the identity.
4. The backend compares the verified email to the invitation.
5. The backend creates a single-use handoff code.
6. The popup sends only the handoff code to the opener using `postMessage`.
7. Both windows validate exact origins.
8. The popup closes.
9. The widget exchanges the handoff for a short-lived upload capability.

Google ID/access/refresh tokens never enter the staging page.

### 8.3 Account mismatch

When the Google account does not match:

```text
This invitation was issued to j•••@example.com.
Your review is still saved in this browser.

[Choose another Google account]
[Cancel]
```

The widget requests account selection on retry. No note or image is deleted or mutated.

### 8.4 Verified reviewer binding

The first successful match binds:

- Project reviewer record
- Normalized verified email
- Google issuer
- Google stable subject identifier
- First and most recent verification times

Future invitations may authorize the stable identity while still displaying the current verified email. Verification is scoped to the organization/project policy; it does not grant global access.

## 9. Upload and processing

After verification:

1. Backend creates an awaiting-upload review record.
2. Backend generates a review ID, one-time nonce, fixed Blob pathname, maximum size, and expiration.
3. Browser builds the `qa-review/1` ZIP with the review ID and nonce binding required by the hosted relay.
4. Browser uploads directly to private quarantine Blob using a single-path client token.
5. Completion callback atomically consumes the upload session.
6. Validation begins.
7. Server reconstructs a canonical package.
8. Server signs the approved package.
9. Render and delivery jobs begin.
10. Widget receives accepted confirmation.

The detailed validation and attestation model is defined in `hosted-relay-spec.md`.

### Review statuses

```text
provisional
awaiting_verification
authorized
uploading
uploaded
validating
rejected
approved
rendering
delivering
completed
completed_with_delivery_errors
expired
deleted
```

The widget may show `accepted` once the server has durably stored the private upload and queued validation. It must distinguish acceptance from completed integration delivery.

## 10. Archive naming

Blob keys never contain reviewer names:

```text
quarantine/<project-id>/<review-id>.zip
approved/<project-id>/<review-id>.zip
```

Friendly download filename:

```text
qa-<sanitized-reviewer-name>-<YYYY-MM-DD>-<short-review-id>.zip
```

Example:

```text
qa-jane-doe-2026-09-27-01KXYZ.zip
```

Use the submission date in UTC and a review ID suffix to prevent collisions.

## 11. Renderers and destinations

Renderers convert canonical data into representations. Destinations transport representations. Keep these concepts independent.

### Renderers

- Canonical ZIP
- Aggregate JSON
- AI-ready Markdown
- Human-readable Markdown
- Static offline HTML
- PDF
- CSV
- Excel workbook
- Google Sheets rows
- Normalized ticket payload

### Destinations

- QAWELL dashboard
- Google Drive
- Google Sheets
- Agency Brain
- Sifter
- Generic signed webhook
- Email attachment or secure link

Example configuration:

```json
{
  "deliveries": [
    { "destination": "qa-capture", "formats": ["zip"] },
    { "destination": "google-drive", "connectionId": "gdrive_123", "formats": ["zip", "pdf"] },
    { "destination": "agency-brain", "connectionId": "agency_123", "formats": ["ticket-json"] }
  ]
}
```

Delivery failure never deletes or invalidates an approved review.

## 12. Google Drive and Sheets

Google sign-in and Google Drive authorization are separate flows.

Only an organization/project administrator may connect a destination account. The connection stores encrypted server-side OAuth credentials and a configured folder or spreadsheet target.

Drive delivery may produce:

```text
Client Website QA/
└── 2026-09-27 — Jane Doe — 01KXYZ/
    ├── qa-jane-doe-2026-09-27-01KXYZ.zip
    ├── review.pdf
    ├── review.md
    └── offline-review.zip
```

Sheets delivery produces one note per row and stores or links screenshots separately. Sheets is a view, not the canonical archive.

## 13. Offline HTML output

The offline renderer produces:

```text
combined-review/
├── index.html
├── aggregate.json
├── review.md
└── assets/
```

Requirements:

- No network access
- No remote JavaScript or CSS
- Restrictive Content Security Policy
- Captured HTML shown only as escaped text
- Text inserted using safe DOM APIs
- Search and filters by reviewer, page, kind, and text
- Print styling
- Source review/note provenance
- Assets referenced by relative paths

## 14. PDF output

PDF is a presentation view generated from the validated canonical model:

- Cover and summary
- Reviewer and submission date
- Notes grouped by page
- Reviewer text and screenshots
- Capture viewport
- Reproduction URL
- Optional technical appendix

Raw captured HTML and lengthy diagnostics remain outside the primary narrative. PDF generation occurs server-side or by printing the safe static HTML renderer.

## 15. Data model additions

In addition to tables in `hosted-relay-spec.md`:

### `users`

- `id`
- `primary_email`
- `display_name`
- `google_issuer`
- `google_subject`
- `created_at`

### `organizations`

- `id`
- `name`
- `retention_days`
- `created_at`

### `organization_members`

- `organization_id`
- `user_id`
- `role`
- `created_at`

### `project_origins`

- `id`
- `project_id`
- `origin`
- `verification_method`
- `verified_at`

### `project_reviewers`

- `id`
- `project_id`
- `normalized_email`
- `google_issuer`
- `google_subject`
- `status`
- `first_verified_at`
- `last_verified_at`

### `invitations`

- `id`
- `project_id`
- `reviewer_id`
- `secret_hash`
- `staging_url`
- `personal_message`
- `access_instructions`
- `scope`
- `status`
- `maximum_reviews`
- `accepted_review_count`
- `expires_at`
- `sent_at`
- `opened_at`
- `started_at`
- `revoked_at`

### `rendered_outputs`

- `id`
- `review_id` or `aggregate_id`
- `format`
- `blob_path`
- `sha256`
- `status`
- `created_at`

## 16. API additions

Administrative:

```text
POST   /v1/projects
POST   /v1/projects/{id}/origins
POST   /v1/projects/{id}/invitations
GET    /v1/projects/{id}/reviews
POST   /v1/projects/{id}/connections
POST   /v1/reviews/{id}/deliveries
```

Invitation and reviewer:

```text
POST   /v1/invitations/exchange
POST   /v1/reviewer-auth/start
GET    /v1/reviewer-auth/callback/google
POST   /v1/reviewer-auth/exchange
POST   /v1/reviews/{id}/draft
GET    /v1/reviews/{id}/status
```

Every handoff, invitation, upload, and callback endpoint has separate rate limits and stable audit events.

## 17. Failure and recovery behavior

| Failure | Required behavior |
| --- | --- |
| Wrong Google account | Preserve draft; offer account chooser again. |
| Popup closed | Preserve draft; return to finish screen. |
| Popup blocked | Explain how to allow it; preserve draft. |
| Invitation expired | Preserve draft; allow administrator to renew invitation. |
| Network offline | Preserve draft; retry when online. |
| Upload interrupted | Resume/restart using a newly authorized upload token. |
| Validation rejection | Preserve local draft and show safe error; notify administrator. |
| Integration fails | Keep approved review; retry delivery independently. |
| Browser quota full | Warn immediately; offer recovery export or reduce image storage. |

## 18. Privacy and retention

- No capture before explicit reviewer activation.
- Reviewer can inspect note count and remove notes before sending.
- Invitation email explains captured categories.
- Project administrator configures retention within supported bounds.
- Local draft is deleted after confirmed submission plus a short recovery grace period.
- Revoking an invitation prevents new verification and uploads.
- Deleting a controlled review removes its canonical and rendered objects.
- Third-party deliveries follow destination-specific deletion capabilities.
- Access to approved reviews is logged.

## 19. Initial release scope

### Release 1: Verified archive delivery

- Developer Google sign-in
- Organization and project creation
- Allowed origin verification
- Versioned script snippet
- Email invitation creation and delivery
- Local review capture with IndexedDB persistence
- End-of-session Google account selection and verification
- Private Blob upload
- Archive validation and canonicalization
- Developer review list and ZIP download
- Agency Brain signed-webhook or pull delivery

### Release 2: Presentation and aggregation

- Multi-ZIP aggregator
- Static HTML
- Markdown
- CSV
- Excel
- PDF
- Dashboard aggregate creation

### Release 3: General integrations

- Google Drive
- Google Sheets
- Generic signed webhooks
- Sifter
- Sanity

## 20. Release 1 acceptance criteria

- A developer can sign in, create a project, verify an origin, and copy an installation snippet.
- A developer can invite an exact reviewer email.
- The invitation opens the correct staging site and activates the correct project.
- A reviewer can complete a multi-page session without Google authentication.
- Notes persist through refresh and same-origin navigation.
- Selecting the wrong Google account does not lose or submit the review.
- The invited verified Google identity can authorize exactly one constrained upload.
- Google tokens never enter the staging page.
- Unverified drafts cannot trigger integrations.
- An approved review is downloadable by an authorized project administrator.
- The filename includes sanitized reviewer name, UTC date, and review ID.
- Agency Brain can idempotently create one ticket per note.
- Integration failure does not delete the approved review.
