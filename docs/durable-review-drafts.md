# Durable hosted review drafts

QAWELL saves an invited review while the reviewer works instead of waiting for the final ZIP submission.

## Reviewer experience

1. Starting a hosted review creates a server review and returns two different credentials.
2. Saving a note uploads its screenshots first, then saves the note payload.
3. The widget shows whether the latest work is saved to QAWELL, syncing, or waiting to retry.
4. A refresh or browser restart restores the draft using the review-specific resume credential.
5. If a Shopify preview hostname changes, reopening the project's stable QA link and entering the same reviewer name recovers the latest unfinished draft.
6. Finishing the pass still creates the canonical ZIP and runs the existing validation and delivery path.

The local browser copy remains useful for responsiveness and temporary network failures, but it is not the sole source of truth for an invited review.

## Credential boundaries

- The invitation token authorizes entry to a project review.
- The resume token is unique to one review, stored only as a hash on the server, and may refresh the one-hour final-upload token.
- The final-upload token remains short-lived and single-purpose.
- Every draft request must also come from an origin currently allowed by the project, including the pinned Shopify preview-store rule.
- Finalized reviews reject all further draft reads and writes.

For reusable shared links, exact-name recovery is available when the browser no longer has its resume token. It requires possession of the current shared link, ignores the placeholder reviewer name, and only selects unfinished reviews that already contain server-saved work.

## Storage and limits

- `review_notes` stores up to 25 editable note payloads per review.
- `review_assets` records screenshots stored privately in Vercel Blob.
- Screenshots must be PNG, JPEG, or WebP, must pass byte-signature validation, and must not exceed 2 MB each.
- A note may reference up to five screenshots.
- The existing canonical archive remains the retained final record after submission.
- After the canonical archive is safely retained, temporary draft notes and screenshot Blobs are removed. Cleanup failure does not turn a successful submission into a reviewer-facing failure; retained draft metadata remains available for later operational cleanup.

## Failure behavior

- A failed draft save keeps the local note and displays a retry state.
- Returning online retries the outstanding draft.
- A screenshot must finish saving before its note can be accepted by the server.
- Reconnecting rotates only the short-lived final-upload credential; it does not create another review.
- Rotating a reusable project link does not reject active drafts. The reviewer must open the new link before reconnecting if the old invitation token is no longer valid.

## Still deferred

Pass 1 does not move final integration delivery to a background worker. Submission still validates the ZIP and delivers tickets synchronously. The next reliability pass should add a durable server queue, idempotent worker retries, progress reporting, and provider-aware backoff.
