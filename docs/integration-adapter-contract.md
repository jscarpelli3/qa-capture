# QAWELL integration adapter contract

Status: Agency Brain is live. Sifter and Asana are planned and must not make network calls until their connection flows are implemented and verified.

## Product rule

A project has zero or one active delivery destination. With no active integration, the reviewer downloads the review archive. With one active integration, QAWELL retains the archive and delivers each note to that destination.

The database enforces this with a partial unique index on active `project_integrations` rows. Multi-destination fan-out is a separate future feature; it must define partial-success behavior before this constraint is changed.

## Adapter boundary

Each provider implements `ReviewDeliveryAdapter` from `apps/web/src/lib/delivery-adapters/types.ts`:

```ts
interface ReviewDeliveryAdapter {
  provider: "agency_brain" | "sifter" | "asana";
  deliver(input: {
    reviewId: string;
    review: QawellReview;
  }): Promise<{
    mode: "integration";
    provider: "agency_brain" | "sifter" | "asana";
    delivered: number;
  }>;
}
```

The ingest pipeline calls the provider-neutral dispatcher. The dispatcher finds the project's active integration and rejects providers without a live adapter. Provider code is responsible for loading its encrypted credential on the server; secrets never enter widget configuration, review archives, logs, or browser responses.

## Required provider behavior

Every live adapter must:

1. Validate credentials and let the developer select an external project before activation.
2. Create one external record per QAWELL note.
3. Upsert a `review_deliveries` row before the external request.
4. Treat an already-delivered note as successful without creating another record.
5. Reconcile uncertain attempts against the external system before retrying creation.
6. Save the external ID and human-readable label after delivery.
7. Normalize timeouts, authentication failures, rate limits, validation failures, and upstream errors without storing secret-bearing response bodies.
8. Preserve the QAWELL review ID and note ID in the external record so a person or automation can correlate the ticket with the retained archive.

## Normalized delivery map

The downloadable review package can expose provider results without adopting a provider's native schema:

```json
{
  "provider": "asana",
  "externalProject": {
    "id": "external-project-id",
    "name": "Website QA"
  },
  "notes": [
    {
      "noteId": "note-id",
      "status": "delivered",
      "externalId": "task-or-issue-id",
      "externalLabel": "Human-readable ticket label",
      "externalUrl": "https://provider.example/item/id"
    }
  ]
}
```

Provider-native responses do not belong in the archive. Add normalized fields to `review_deliveries` when needed; do not overload note data with delivery state.

## Shared note mapping

Adapters should share the same source semantics:

- Title: note type, followed by a compact form of the reviewer's text.
- Description: full feedback, page URL, closest anchor URL when available, viewport, selector, XPath, selected text, relevant computed styles, diagnostic counts, review ID, and note ID.
- Attachment: include a reviewer-supplied screenshot when present and supported. Screenshot failure must never block the note.
- Reporter: use the invited reviewer's verified name and email where the provider supports it. Do not impersonate a provider user.
- Priority: map only when QAWELL has a meaningful value. A bug can receive a stronger default than a general note, but provider-specific priorities must remain configurable later.

## Provider plans

### Agency Brain

- Credential: encrypted API key.
- Destination: Agency Brain project ID and name.
- Record: QA ticket.
- Idempotency: search for the embedded QAWELL review/note reference, in addition to checking `review_deliveries`.
- Status: live.

### Sifter

- Credential: encrypted Sifter API token plus the account hostname/site identifier required to construct API URLs.
- Destination: Sifter project.
- Record: issue created through the project's issues endpoint.
- Idempotency: store the QAWELL reference in the issue body and search/reconcile it before retrying, subject to the API's available read filters.
- Connection requirement: confirm that the target Sifter account has API write access before presenting the integration as available. Sifter's current documentation describes write access as restricted/private beta.
- Status: adapter boundary and catalog entry only.

### Asana

- Credential: OAuth authorization-code flow. Store the refresh token encrypted and refresh short-lived access tokens server-side.
- Minimum expected scopes: project read access for destination selection plus task read/write access for reconciliation and creation. Confirm exact scopes against Asana's current scope list during implementation.
- Destination: Asana project GID and name.
- Record: task created in the selected project.
- Idempotency: embed the QAWELL reference in the task notes, then search or use a provider-supported custom field when available. Do not require a paid Asana custom-field feature for the first version.
- Status: adapter boundary, enum migration, and catalog entry only.

## Connection lifecycle

1. Developer starts a provider connection from a project.
2. QAWELL completes token/API-key verification entirely on the server.
3. QAWELL fetches selectable external projects using least-privilege access.
4. Developer chooses one destination.
5. QAWELL writes the encrypted credential and activates the integration in one controlled server operation.
6. Activating a destination disables the previous active destination in the same transaction.
7. Disconnecting marks the integration disabled and deletes or renders its credential unusable.

## Work required to launch another provider

- Connection UI and server-side credential exchange/verification.
- External project picker.
- Provider adapter with retry reconciliation.
- Error/status presentation in the dashboard.
- Contract tests with mocked upstream responses for success, duplicate retry, authentication failure, rate limiting, timeout, and partial delivery.
- A provider-specific manual smoke test before changing its catalog availability to `available`.
