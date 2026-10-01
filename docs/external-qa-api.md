# External QA API

Lets an outside system read, update, and file QA tickets for one organization.
Base URL: `https://theagencybrain.com/api/external/qa`. Every request carries
`Authorization: Bearer ab_...`. Vercel preview URLs sit behind deployment
protection, so integrations are tested against production or a staging key.

## Keys

- Created in **Settings → API Keys** (admin and superadmin only). The plaintext
  is shown once and never again; only a SHA-256 hash is stored.
- A key belongs to one organization and to the admin who created it. Notes and
  status changes made with the key are attributed to that admin.
- A key holds one or more **scopes**, chosen at creation. Scopes never change
  after creation: to widen access, create a new key and revoke the old one.
- Revoking a key takes effect on the next request. Last-used time is shown in
  Settings.
- A key stops working when the admin who created it is deactivated or is no
  longer an admin in the organization. Create a replacement key from a current
  admin before that happens.

| Scope       | Grants                                                               |
| ----------- | -------------------------------------------------------------------- |
| `qa:read`   | `GET /projects`, `GET /tickets`, `GET /tickets/{id}`                 |
| `qa:write`  | `PATCH /tickets/{id}` (status, assignee), `POST /tickets/{id}/notes` |
| `qa:create` | `POST /tickets`                                                      |

An app that only files tickets should get a key with `qa:create` alone. It can
then create tickets but cannot list, read, or change any.

## Responses

- `401` missing, malformed, unknown, or revoked key.
- `403` key is valid but lacks the scope the route needs.
- `404` the id (project or ticket) is not in the key's organization.
- `422` body failed validation. The `error` field names the problem.
- `429` rate limit reached. A key may make 120 requests a minute across all
  routes, and file 30 tickets a minute. The `error` field says how many seconds
  to wait.
- `500` something failed on our side. The message is generic by design; retry
  later, and contact us if it persists.

## POST /tickets — scope `qa:create`

Files one ticket on a QA-enabled project. The ticket is stored as an
**external** submission, the same as one filed through the project's public QA
form: it is the outside app's report, not the key owner's, so it is auto-assigned
to the project's PM (or the client's PM) unless `assigned_to` is given.

### Request body

| Field             | Type   | Required | Constraints                                                                             |
| ----------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| `project_id`      | uuid   | yes      | A project returned by `GET /projects` (QA must be enabled on it).                       |
| `title`           | string | yes      | 1 to 500 characters after trimming.                                                     |
| `description`     | string | no       | Up to 10,000 characters. Plain text; Markdown is not rendered.                          |
| `severity`        | enum   | no       | `low`, `medium`, `high`, `critical`. Defaults to `medium`.                              |
| `submitter_name`  | string | no       | Up to 200 characters. Who reported the issue in the sending app.                        |
| `submitter_email` | string | no       | Up to 200 characters, must look like an email. Shown to the PM; no email is sent to it. |
| `deliverable_id`  | uuid   | no       | Must belong to `project_id`. Ties the ticket to a deliverable.                          |
| `assigned_to`     | uuid   | no       | An active member of the organization. Omit to auto-assign to the project's PM.          |
| `due_date`        | date   | no       | `YYYY-MM-DD`.                                                                           |

Unknown fields are ignored. `status` cannot be set on create; every new ticket
is `open`. Screenshots and attachments cannot be sent through this endpoint yet;
the upload flow is bound to the public form's token.

If the project's QA period has been closed in Agency Brain, the ticket is still
created and flagged `submitted_after_close: true`.

### Example

```bash
curl -X POST https://theagencybrain.com/api/external/qa/tickets \
  -H "Authorization: Bearer $AGENCY_BRAIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "…",
    "title": "Checkout button unresponsive on iOS Safari",
    "description": "Steps: add item, tap Checkout. Nothing happens. iOS 19.2, Safari.",
    "severity": "high",
    "submitter_name": "Reporter name",
    "submitter_email": "reporter@example.com"
  }'
```

### Response `201`

```json
{
  "id": "…",
  "ticket_number": 42,
  "project_id": "…",
  "project_name": "…",
  "project_pm": { "id": "…", "name": "…" },
  "title": "Checkout button unresponsive on iOS Safari",
  "description": "…",
  "severity": "high",
  "status": "open",
  "substatus": [],
  "source": "external",
  "opened_by": null,
  "submitter_name": "Reporter name",
  "submitter_email": "reporter@example.com",
  "assigned_to": { "id": "…", "name": "…" },
  "deliverable": null,
  "notes_count": 0,
  "due_date": null,
  "submitted_after_close": false,
  "created_at": "2026-09-29T14:00:00.000Z",
  "updated_at": "2026-09-29T14:00:00.000Z"
}
```

`ticket_number` is the per-organization number shown in the app as `QA #42`.
Store `id` for later `GET`, `PATCH`, or note calls.

There is no idempotency key. A retried request creates a second ticket, so the
sending app should record the returned `id` before retrying.

## Ticket schema

What a ticket is, for mapping another system's fields onto it. Read fields come
back from `GET /tickets` and `GET /tickets/{id}`; the last column says which
route can set each field.

| Field                   | Type      | Values / shape                                        | Set by                                         |
| ----------------------- | --------- | ----------------------------------------------------- | ---------------------------------------------- |
| `id`                    | uuid      |                                                       | server                                         |
| `ticket_number`         | integer   | Sequential per organization                           | server                                         |
| `project_id`            | uuid      |                                                       | `POST /tickets`                                |
| `project_name`          | string    |                                                       | server                                         |
| `project_pm`            | object    | `{ id, name }` or `null`                              | server                                         |
| `title`                 | string    | 1 to 500 chars                                        | `POST /tickets`                                |
| `description`           | string    | Up to 10,000 chars, or `null`                         | `POST /tickets`                                |
| `severity`              | enum      | `low` `medium` `high` `critical`                      | `POST /tickets`                                |
| `status`                | enum      | `open` `resolved` `closed` `reopened`                 | `PATCH /tickets/{id}`; always `open` on create |
| `substatus`             | string[]  | Optional badges set inside the app                    | app only                                       |
| `source`                | enum      | `internal` (filed in the app) or `external`           | server; API-created tickets are `external`     |
| `opened_by`             | object    | `{ id, name }` or `null`; `null` for external tickets | server                                         |
| `submitter_name`        | string    | Or `null`                                             | `POST /tickets`                                |
| `submitter_email`       | string    | Or `null`                                             | `POST /tickets`                                |
| `assigned_to`           | object    | `{ id, name }` or `null`                              | `POST /tickets`, `PATCH /tickets/{id}`         |
| `deliverable`           | string    | Deliverable name or `null`                            | `POST /tickets` via `deliverable_id`           |
| `due_date`              | date      | `YYYY-MM-DD` or `null`                                | `POST /tickets`                                |
| `submitted_after_close` | boolean   | QA period was closed when filed                       | server                                         |
| `notes_count`           | integer   |                                                       | server                                         |
| `notes`                 | array     | `{ id, author, content, created_at }`; detail only    | `POST /tickets/{id}/notes`                     |
| `status_history`        | array     | `{ from_status, to_status, changed_at }`; detail only | server                                         |
| `created_at`            | timestamp | ISO 8601                                              | server                                         |
| `updated_at`            | timestamp | ISO 8601                                              | server                                         |

### Status lifecycle

`open` → `resolved` (fix attempted, awaiting verification) → `closed`
(confirmed). `reopened` means a resolved or closed ticket recurred. There is no
`in_progress` status. Outside apps should not set `closed`; the PM or opener
closes after verifying.

### Mapping guidance

- Map your severity or priority onto the four values above. Anything you cannot
  map should be `medium`.
- Put reporter identity in `submitter_name` and `submitter_email`, not in the
  description.
- Put your own record id in the description (for example `Ref: XYZ-123`) if you
  need to find the ticket again from your side. There is no external reference
  field yet.
- Fetch `GET /projects` once and cache the project ids; they do not change.

## Other endpoints

- `GET /projects` — QA-enabled projects with client, PM, and open/total counts.
- `GET /tickets` — query params (all optional): `project_id` (comma-separated),
  `client_id`, `status` (comma-separated), `assigned_to=me`, `limit` (max 500),
  `offset`. Returns `{ total, tickets }`.
- `GET /tickets/{id}` — full detail including `notes` and `status_history`.
- `PATCH /tickets/{id}` — body `{ "status": …, "assigned_to": <user id|null> }`.
  Only these two fields.
- `POST /tickets/{id}/notes` — body `{ "content": "…" }`.
