# Durable integration delivery

QAWELL separates reviewer submission from external integration delivery.

## Submission boundary

The archive endpoint still performs the security-sensitive work synchronously: it consumes the upload credential, validates the ZIP and captured origins, stores the canonical private package, and creates durable delivery jobs. Once those steps succeed, the reviewer sees **QA received** and may close or refresh the page.

Agency Brain network calls do not run in that browser request.

## Queue and ledger

- Vercel Queues provides durable wake-ups, at-least-once delivery, delayed retries, and a private push consumer.
- `review_delivery_jobs` in Supabase is the authoritative job ledger. A queue message may expire or be delivered more than once without losing or duplicating the underlying work.
- Each message processes exactly one QA note. A large pass is never one long-running function invocation.
- A five-minute production cron republishes jobs whose initial queue publish was not confirmed. Every publish has a stable idempotency key.
- A database claim function serializes provider work. This keeps Agency Brain traffic comfortably below its key-level rate limit while the product is in beta.

## Idempotency

Ticket retries first use the existing `review_deliveries` mapping. After an uncertain attempt, QAWELL also searches Agency Brain for the embedded review/note reference before creating anything.

Screenshot retries are tracked separately in `review_delivery_attachments`. Screenshots already accepted by Agency Brain are skipped, while only missing or failed screenshots are retried.

## Retry policy

- `429`, provider `5xx`, network failures, and internal transient failures retry with exponential backoff.
- Agency Brain `Retry-After` is honored whether expressed as seconds or an HTTP date.
- Authentication, authorization, invalid payloads, missing retained packages, and other permanent failures stop retrying.
- Jobs stop after eight attempts and become `permanent_failure`.
- A submitted review becomes `delivered` only when every note job succeeds. Any permanent job failure makes the review `delivery_failed`; the canonical package remains available.

## Visible states

The project dashboard includes submitted reviews in `queued`, `delivering`, `delivered`, and `delivery_failed` states. Each card shows delivered, queued, and needs-attention note counts. Existing ticket mappings remain inspectable while work continues.

## Operational configuration

- Queue topic: `qawell-review-delivery-v1`
- Consumer: `src/app/api/queues/review-delivery/route.ts`
- Dispatch safety net: `GET /api/internal/delivery-dispatch`
- Production requires `CRON_SECRET`; the dispatcher fails closed when it is absent or incorrect.
- Migration: `202611130002_durable_delivery_queue.sql`
