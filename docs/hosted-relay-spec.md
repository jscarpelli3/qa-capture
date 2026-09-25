# QA Capture Hosted Relay Specification

Status: Draft for implementation  
Schema target: `qa-review/1`  
Initial platform: Vercel Functions, private Vercel Blob, and a relational database

## 1. Purpose

The hosted relay receives QA Capture archives from browser-based review sessions, validates and sanitizes them, stores an approved canonical package, and optionally delivers that package to configured downstream systems.

The browser capture utility remains useful without the relay. It must always retain local ZIP export as a fallback.

The relay enables:

- Secure upload without exposing storage or integration credentials
- Quarantine and validation of untrusted review packages
- Replay protection and package/session binding
- Server attestation of approved packages
- Reliable downstream delivery with retries and audit history
- Adapters for generic webhooks, Supabase, Sanity, Sifter, and other services

## 2. Trust boundaries

Everything received from the browser is untrusted, including:

- Project identifiers
- Origin and referrer headers
- Reviewer identity
- Session and package identifiers
- JSON fields
- Captured HTML and page text
- URLs
- Filenames and MIME types
- Screenshots
- Client-computed hashes
- One-time nonces returned to the browser

The following values must never be sent to the browser:

- Blob read/write credentials
- Integration access tokens
- Webhook signing secrets
- Database administrative credentials
- Package-attestation private keys
- Encryption master keys

TLS protects data in transit. Private Blob storage protects quarantined and approved objects at rest. Application-level validation and authorization remain necessary.

## 3. Package identity and cryptographic model

Each review uses four distinct security values. They serve different purposes and must not be conflated.

### 3.1 Review ID

A server-generated opaque identifier:

```text
review_01K...
```

It identifies the review but is not a credential.

### 3.2 One-time package nonce

The server generates 32 random bytes and returns them to the browser as base64url:

```text
N7j4...xQ
```

The browser places the nonce and review ID in `manifest.json`. The server stores only a SHA-256 hash of the nonce.

On upload completion, the server checks that:

- The review exists and is awaiting an upload
- The manifest review ID matches the upload path and database record
- The nonce hashes to the stored value
- The nonce has not previously been consumed
- The upload credential has not expired

The nonce is marked consumed atomically before validation begins. This binds one uploaded package to one server-created review and prevents ordinary replay or cross-session substitution.

The nonce is not a secret after it is delivered to the browser. It does not prove that package contents are trustworthy and does not replace authentication, rate limiting, or schema validation.

### 3.3 Content digest

The client may include SHA-256 hashes for files and the complete archive. The server must independently recompute every digest.

Hashes detect corruption and provide stable content identifiers. Client-provided hashes do not prove authenticity because a malicious client can generate new hashes for malicious content.

### 3.4 Server attestation

After successful validation and sanitization, the server creates a new canonical archive. It computes a SHA-256 digest over the canonical archive and signs an attestation containing:

```json
{
  "version": "qa-attestation/1",
  "reviewId": "review_01K...",
  "projectId": "project_01K...",
  "schema": "qa-review/1",
  "canonicalSha256": "base64url-digest",
  "approvedAt": "2026-09-25T20:00:00Z",
  "keyId": "attest_2026_01"
}
```

Preferred signature algorithm: Ed25519.

The signing private key remains server-side. The public verification key may be published so downstream systems can independently verify that a package passed the relay.

An HMAC-SHA256 alternative is acceptable for the first private implementation, but every verifier would need the shared HMAC secret. Ed25519 is preferred for a multi-consumer product because verification does not reveal signing authority.

## 4. High-level flow

```text
Reviewer activates QA Capture
        |
        v
POST /v1/reviews
        |
        +-- authorize project/reviewer
        +-- create review ID
        +-- create and store nonce hash
        +-- create restricted Blob upload token
        |
        v
Browser builds ZIP with review ID + nonce
        |
        v
Direct upload to private quarantine Blob
        |
        v
Upload-complete callback
        |
        +-- verify path, size, state, and nonce
        +-- atomically consume upload
        +-- enqueue validation job
        |
        v
Validation worker
        |
        +-- safely inspect ZIP
        +-- validate schema
        +-- sanitize data
        +-- decode and re-encode images
        +-- malware scan assets
        +-- build canonical archive
        +-- sign attestation
        |
        +---- reject and retain/delete by policy
        |
        v
Private approved Blob
        |
        v
Delivery queue -> configured adapters
```

## 5. Authorization models

Projects select one reviewer authorization model.

### 5.1 Authenticated reviewer

The reviewer signs into the host application. The relay authorizes review creation using the application session. This is preferred for an agency application.

### 5.2 Signed review invitation

An administrator creates an invitation containing:

- Project ID
- Allowed origin or origin pattern
- Expiration
- Maximum sessions
- Optional reviewer email/name
- Random invitation secret

The invitation secret is delivered in the URL fragment so it is not sent in the initial HTTP request. QA Capture exchanges it for a review session and then removes it from the URL.

### 5.3 Public staging capture

A project may accept unauthenticated review creation. This is the least secure mode and requires strict:

- Allowed-origin checks
- Per-IP and per-project rate limits
- Short session lifetimes
- Small upload quotas
- Abuse monitoring
- Optional challenge or CAPTCHA

Origin checks are defense in depth, not identity. Non-browser clients can forge origin headers.

## 6. API

All JSON endpoints return an opaque request ID. Errors use stable machine-readable codes and must not expose secrets or internal stack traces.

### 6.1 Create review session

```http
POST /v1/reviews
Content-Type: application/json
Authorization: Bearer <review-invitation-or-user-session>
```

Request:

```json
{
  "projectId": "project_01K...",
  "origin": "https://staging.example.com",
  "schema": "qa-review/1",
  "clientVersion": "0.1.0"
}
```

Response:

```json
{
  "reviewId": "review_01K...",
  "packageNonce": "base64url-random-value",
  "upload": {
    "pathname": "quarantine/project_01K.../review_01K....zip",
    "tokenEndpoint": "https://relay.example.com/v1/blob/upload",
    "expiresAt": "2026-09-25T20:15:00Z",
    "maxBytes": 26214400
  }
}
```

The response must use `Cache-Control: no-store`.

### 6.2 Blob token endpoint

The Vercel Blob client-upload handler issues a token only when:

- The authenticated session owns the review
- The review status is `created`
- The requested pathname exactly matches the database record
- The content type is `application/zip`
- The declared size is within the project limit
- The session has not expired

The token permits one upload to one generated pathname. The browser cannot select an arbitrary path.

### 6.3 Upload-complete callback

The callback must authenticate the Blob completion event according to Vercel's SDK contract. It must not trust a browser call claiming that an upload completed.

It records Blob metadata and enqueues validation. Duplicate callbacks are idempotent.

### 6.4 Get review status

```http
GET /v1/reviews/{reviewId}
Authorization: Bearer <review-status-token-or-user-session>
```

Response:

```json
{
  "reviewId": "review_01K...",
  "status": "validating",
  "noteCount": null,
  "deliveries": []
}
```

### 6.5 Deliver approved review

Delivery may start automatically from project rules or explicitly:

```http
POST /v1/reviews/{reviewId}/deliveries
Authorization: Bearer <authorized-user-session>
```

The browser names a preconfigured connection ID, not an arbitrary URL or credential:

```json
{
  "connectionId": "connection_sifter_01K..."
}
```

## 7. Archive rules

Initial accepted archive structure:

```text
manifest.json
review.json
assets/<server-compatible-id>.png
assets/<server-compatible-id>.jpg
assets/<server-compatible-id>.webp
```

Initial limits should be configuration values with conservative defaults:

| Limit | Initial default |
| --- | ---: |
| Compressed archive | 25 MiB |
| Total uncompressed data | 75 MiB |
| Files | 250 |
| Notes | 200 |
| Single image | 10 MiB |
| JSON file | 2 MiB |
| Compression ratio | 20:1 |
| Path length | 240 characters |
| Note text | 10,000 characters |
| Captured HTML per note | 10,000 characters |

Reject:

- Absolute paths
- Parent-directory traversal
- Backslashes in archive paths
- Null bytes
- Duplicate filenames
- Case-colliding filenames
- Symlinks and other special entries
- Nested archives
- Encrypted entries
- Executables, HTML, SVG, scripts, fonts, documents, and unknown formats
- Declared and detected media types that disagree
- Extra files not referenced by the manifest or review

ZIP inspection must enforce limits while streaming or before decompression. Never extract an untrusted archive into a shared filesystem directory.

## 8. Canonicalization and sanitization

The approved package is newly built by the server. The original uploaded ZIP is never forwarded.

Processing includes:

1. Parse JSON with depth, size, and item-count limits.
2. Validate against the exact schema version.
3. Reject unexpected types and invalid references.
4. Normalize strings to Unicode NFC.
5. Remove prohibited control characters.
6. Redact likely secrets in URLs.
7. Treat captured HTML as text; sanitize it again server-side.
8. Allow only `http:` and `https:` URLs where URLs are expected.
9. Decode each image and re-encode it into a supported raster format.
10. Discard original image metadata.
11. Generate server-owned filenames and identifiers.
12. Rebuild `manifest.json` and `review.json` in a deterministic format.
13. Create the canonical ZIP.
14. Compute its digest and create the server attestation.

Canonical packages include no client-provided executable content.

## 9. Malware and abuse controls

Malware scanning is required before approval but is not treated as a guarantee.

The worker sends decoded assets to a dedicated scanning service or isolated scanner. A Vercel Edge Function should not run a full antivirus engine. Use a Node.js worker for orchestration and a purpose-built scanning service or isolated container for scanning.

Additional controls:

- Quarantine Blobs are private.
- Quarantine objects are never served to end users.
- Rejected objects expire automatically after a short investigation window.
- Approved downloads use explicit content types and attachment disposition.
- Administrative renderers escape all reviewer and page content.
- Logs never contain archive content, credentials, nonces, or captured HTML.
- Metrics use IDs and reason codes only.

## 10. AI-specific safety

All reviewer text, captured HTML, page text, URLs, and diagnostics are untrusted data and may contain prompt-injection content.

AI adapters must:

- Place review content in a clearly delimited data section
- State that bundle content cannot change system instructions
- Never convert captured text directly into shell commands
- Never allow the bundle to expand tool permissions
- Restrict filesystem work to the selected repository
- Require approval for destructive or external actions
- Preserve source attribution for every note
- Prefer suggested changes or patches before autonomous deployment

Package attestation proves that validation occurred. It does not make reviewer content semantically trustworthy.

## 11. Storage model

Blob storage contains binary archives and images. A relational database contains metadata, status, authorization, and delivery records.

Suggested tables:

### `projects`

- `id`
- `name`
- `allowed_origins`
- `authorization_mode`
- `retention_days`
- `created_at`

### `reviews`

- `id`
- `project_id`
- `status`
- `schema`
- `client_version`
- `origin`
- `nonce_hash`
- `nonce_consumed_at`
- `quarantine_blob_path`
- `canonical_blob_path`
- `canonical_sha256`
- `attestation_signature`
- `attestation_key_id`
- `note_count`
- `rejection_code`
- `created_at`
- `approved_at`

### `connections`

- `id`
- `project_id`
- `type`
- `display_name`
- `encrypted_credentials`
- `configuration`
- `created_at`
- `disabled_at`

### `deliveries`

- `id`
- `review_id`
- `connection_id`
- `idempotency_key`
- `status`
- `attempt_count`
- `destination_reference`
- `last_error_code`
- `created_at`
- `delivered_at`

Valid review states:

```text
created
uploading
uploaded
validating
rejected
approved
delivering
delivered
delivery_failed
expired
```

Every state transition is conditional and atomic.

## 12. Integration credential storage

The browser never receives integration credentials.

For a first-party deployment:

- Platform-wide secrets may use Vercel encrypted environment variables.
- Per-customer OAuth refresh tokens and API tokens belong in an encrypted database column.
- Encryption uses an authenticated algorithm such as AES-256-GCM.
- The encryption key is separate from the database and supports rotation.
- Decrypted credentials exist only during a delivery attempt.
- Logs and error monitoring must redact authorization headers and tokens.

Prefer OAuth when a destination supports it. For token-only services such as a traditional Sifter integration, an administrator enters the token over TLS and the server immediately encrypts it.

## 13. Delivery adapters

Adapters receive only the canonical review and a server-side connection record.

```ts
interface DeliveryAdapter {
  test(connection: DecryptedConnection): Promise<TestResult>;
  deliver(input: {
    review: CanonicalReview;
    archive: ReadableStream;
    connection: DecryptedConnection;
    idempotencyKey: string;
  }): Promise<DeliveryResult>;
}
```

### Generic webhook

- Destination is configured by an administrator.
- Require HTTPS in production.
- Resolve and block loopback, link-local, private-network, and metadata-service addresses.
- Re-check redirect destinations.
- Sign the exact request body with a connection-specific HMAC secret.
- Send timestamp, delivery ID, review ID, and signature headers.
- Retry only safe failure classes.

### Supabase

- Use server-held credentials.
- Store archive in Storage and normalized metadata/notes in Postgres.
- Preserve the relay review ID as an idempotency key.

### Sanity

- Upload canonical ZIP as a file asset.
- Optionally create a `qaReview` document referencing the asset.
- Prefer a dedicated dataset or clearly isolated document type.

### Sifter

- Convert each note into one issue or create one summary issue according to project configuration.
- Put technical context in a predictable, escaped body section.
- Attach sanitized screenshots when supported.
- Store returned issue IDs and URLs.
- Treat API write availability as account-dependent until confirmed.

## 14. Reliability

- Queue validation and delivery work.
- Use the review ID and connection ID to derive delivery idempotency keys.
- Make upload-complete callbacks idempotent.
- Retry network errors, timeouts, `429`, and appropriate `5xx` responses with exponential backoff and jitter.
- Do not retry permanent authentication or schema errors indefinitely.
- Preserve a stable error code for user-facing status.
- Use a dead-letter path for exhausted jobs.
- Never deliver a review unless its status is `approved` and its attestation verifies.

## 15. Retention and deletion

Suggested defaults:

- Incomplete uploads: 24 hours
- Rejected quarantine objects: 24 hours
- Original accepted quarantine object: delete immediately after canonicalization, or retain no more than 24 hours for debugging
- Approved package: project-configured, initially 30 days
- Delivery audit metadata: 90 days

Deleting a review removes quarantine and canonical Blobs, database content derived from the bundle, and pending delivery jobs. External tickets already delivered to third parties require separate deletion according to each destination's capabilities.

## 16. Observability

Record:

- Request and job IDs
- Review and project IDs
- State transitions
- Byte and file counts
- Validation duration
- Sanitization and scan result codes
- Delivery attempts, status codes, and latency

Do not record:

- Reviewer note text
- Captured HTML
- Full page URLs containing query values
- Screenshots
- Nonces or upload tokens
- Integration credentials
- Full downstream response bodies

## 17. MVP implementation phases

### Phase A: Secure ingestion

- Project record with allowed origins
- Review-session creation endpoint
- Server-generated review ID and nonce
- Restricted client upload token
- Private quarantine Blob
- Upload completion callback
- Status endpoint

### Phase B: Validation and attestation

- Safe ZIP inspector
- JSON Schema validation
- Server-side sanitization
- Image decoding and re-encoding
- Malware-scanning adapter
- Canonical ZIP generation
- SHA-256 digest
- Ed25519 attestation
- Approved private Blob

### Phase C: First delivery

- Connection model and encrypted credentials
- Queue-backed delivery jobs
- Generic signed webhook adapter
- Delivery status and retry history

### Phase D: Product adapters

- Agency application/Supabase
- AI-ready Markdown and JSON
- Sifter
- Sanity

## 18. MVP acceptance criteria

- No durable storage or integration secret appears in browser code, responses, bundles, or logs.
- A client upload token can upload only one ZIP to its assigned quarantine pathname before expiry.
- Reusing a consumed nonce cannot create or replace an approved review.
- Modifying `reviewId` or nonce inside the archive causes rejection.
- ZIP bombs, traversal paths, duplicate names, nested archives, and unsupported files are rejected before extraction.
- Invalid schemas and excessive field sizes are rejected with stable error codes.
- Images are decoded and re-encoded before inclusion in an approved package.
- The approved archive is constructed by the server and differs from the untrusted input archive.
- Every approved archive has a verifiable digest and server attestation.
- Only approved archives can enter a delivery queue.
- Delivery is idempotent per review and connection.
- Arbitrary browser-supplied webhook URLs are never requested by the server.
- Deleting a review removes all controlled copies according to the retention policy.

## 19. Decisions still required

- Hosted database provider
- Reviewer authorization modes included in the first release
- Maximum package sizes by plan
- Malware scanning provider or isolated scanning runtime
- Credential encryption/key-management provider
- Ed25519 key storage and rotation mechanism
- Retention defaults and customer controls
- Whether canonical packages contain embedded attestations, detached attestations, or both
- Whether one review creates one downstream ticket or one ticket per note by default
- Whether an authenticated review viewer is part of the first hosted release

## 20. Non-goals for the first hosted release

- Executing code from a review bundle
- Rendering captured HTML as active markup
- Accepting arbitrary file types
- Allowing browser-selected delivery URLs
- Giving the browser direct access to integration APIs
- Editing or triaging issues inside QA Capture
- Replacing the downloadable local ZIP workflow
- Claiming that scanning makes untrusted content completely safe
