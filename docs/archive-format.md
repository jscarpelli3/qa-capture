# QA Capture Archive Format

Status: Normative for `qa-review/1`  
Current generator: QA Capture `0.1.0`

This document defines the portable contract consumed by importers, renderers, ticket mappers, and AI preparation tools. Consumers must branch on the top-level `schema` value and must not infer a schema version from the generator version.

## Archive layout

```text
qa-review-<timestamp>.zip
├── manifest.json
├── review.json
└── assets/
    └── <asset files referenced by review.json>
```

Paths use `/` separators and are relative to the archive root.

An adapter must:

1. Treat the ZIP as untrusted input.
2. Reject absolute paths, `..`, backslashes, duplicate names, symlinks, nested archives, and unsupported file types.
3. Read `manifest.json` first.
4. Require `manifest.schema` to equal `qa-review/1`.
5. Resolve `manifest.reviewFile` within the archive root; it is currently `review.json`.
6. Validate the review against [`schemas/qa-review-1.schema.json`](../schemas/qa-review-1.schema.json).
7. Resolve assets by matching `note.assets[]` to `review.assets[].id`, then use the matching asset's `path`.
8. Never execute or actively render captured HTML.
9. Ignore unknown fields for forward compatibility while preserving them if the review is re-exported.

## `manifest.json`

```json
{
  "schema": "qa-review/1",
  "generator": {
    "name": "QA Capture",
    "version": "0.1.0",
    "delivery": "console-script"
  },
  "reviewFile": "review.json"
}
```

The manifest identifies how to locate and interpret the primary document. It is not a cryptographic signature.

## `review.json`

### Root

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | string | Contract identifier. Exactly `qa-review/1`. |
| `header` | object | Review-level identity, timing, reviewer, platform, and privacy context. |
| `notes` | array | Notes in creation order. May be empty. |
| `assets` | array | Metadata for binary files stored in the ZIP. May be empty. |

### Header

| Field | Type | Meaning |
| --- | --- | --- |
| `header.id` | string | Stable review ID generated when the review begins. Use this for import idempotency. |
| `header.generator` | object | Generator name, version, and delivery mechanism. |
| `header.reviewer.name` | string | Reviewer-entered display name. It is not a verified identity. |
| `header.timing.startedAt` | ISO-8601 string | When the browser review began. |
| `header.timing.exportedAt` | ISO-8601 string | When this representation was exported. |
| `header.platform` | object | Context at export time. This is not a substitute for each note's capture-time viewport. |
| `header.privacy.excluded` | string[] | Categories the generator intentionally did not collect. |

### Platform

`header.platform.page` describes the page open at export time:

| Field | Type | Meaning |
| --- | --- | --- |
| `url` | string or null | Absolute URL with fragment removed and likely secret parameters redacted. |
| `origin` | string | URL origin. |
| `path` | string | URL pathname. |
| `title` | string | Document title. |
| `language` | string or null | Document language. |
| `referrerOrigin` | string or null | Referrer origin only; no referrer path. |

`header.platform.browser` contains a best-effort browser name and version plus the user-agent string. `operatingSystem` is the browser's platform value and should be treated as a label, not a reliably detected OS.

`header.platform.viewport` uses the same shape as note viewports, described below.

### Notes

Every note is an independent candidate for a QA ticket.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable ID within the review. |
| `sequence` | integer | One-based display order shown to the reviewer. |
| `createdAt` | ISO-8601 string | Capture time. |
| `kind` | enum | `note`, `bug`, `copy`, `design`, or `question`. |
| `text` | string | The reviewer's requested change or observation. |
| `page` | object | Page context at note time. |
| `target` | object | Selected DOM element context. |
| `viewport` | object | Browser-window state at note time. |
| `diagnostics` | object | Recent errors and failed requests observed before capture. |
| `assets` | string[] | Asset IDs referencing root `assets[]`. |
| `captureWarnings` | string[] | Optional reasons some context could not be captured. |

The durable source key for a ticket is:

```text
<header.id>:<note.id>
```

An importer must enforce a uniqueness constraint on that pair. Re-importing the same archive must update, skip, or report existing tickets rather than create duplicates.

### Page context

Each note has its own `page` object because a review may span several routes.

```json
{
  "url": "https://staging.example.com/pricing?plan=agency",
  "origin": "https://staging.example.com",
  "path": "/pricing",
  "title": "Pricing",
  "language": "en",
  "referrerOrigin": "https://staging.example.com"
}
```

Adapters should display `url` as a reproduction link only after confirming that its protocol is `http:` or `https:`. Reviewer-provided or captured URLs are untrusted.

### Target context

`target` describes the selected element at note time:

| Field | Type | Meaning |
| --- | --- | --- |
| `selector` | string | Best-effort CSS selector. It may drift after code changes. |
| `xpath` | string | Structural fallback locator. It may also drift. |
| `tag` | string | Lowercase element tag. |
| `attributes` | object | Captured string attributes with form values and inline handlers excluded. |
| `text` | string | Truncated visible text. |
| `html` | string | Truncated, sanitized outer HTML. Always render as escaped text. |
| `rect.viewport` | rect | Element bounds relative to the viewport at capture. |
| `rect.document` | rect | Element bounds relative to the document at capture. |
| `styles` | object | Curated computed CSS properties as strings. |
| `ancestors` | array | Up to five nearest DOM ancestors. |

A rectangle has numeric `x`, `y`, `width`, and `height` fields expressed in CSS pixels.

Selectors are evidence, not durable database identifiers. A mapper should store selector, XPath, target text, and ancestors together so a human or agent can relocate an element after the DOM changes.

### Capture-time viewport

```json
{
  "width": 1440,
  "height": 900,
  "outerWidth": 1512,
  "outerHeight": 982,
  "devicePixelRatio": 2,
  "scrollX": 0,
  "scrollY": 614,
  "colorScheme": "dark",
  "reducedMotion": false
}
```

`width` and `height` are `window.innerWidth` and `window.innerHeight`. They represent the page's available viewport when the note was created. `outerWidth` and `outerHeight` describe the browser window where supported. Each note carries its own values because the reviewer may resize the browser during a session.

### Diagnostics

`diagnostics.consoleErrors[]` may contain:

```json
{
  "type": "error",
  "message": "ReferenceError: example is not defined",
  "source": "https://staging.example.com/app.js",
  "line": 42,
  "column": 9,
  "at": "2026-09-25T19:14:00.000Z"
}
```

`diagnostics.failedRequests[]` may contain:

```json
{
  "method": "GET",
  "url": "https://staging.example.com/api/items",
  "status": 500,
  "durationMs": 218,
  "error": null,
  "at": "2026-09-25T19:14:01.000Z"
}
```

Diagnostics are a recent snapshot, not necessarily caused by the selected element. UI should label them as nearby diagnostics rather than definitive causes.

### Assets

Root `assets[]` entries describe files in the ZIP:

```json
{
  "id": "asset_...",
  "kind": "element-image",
  "path": "assets/note_....png",
  "mime": "image/png",
  "width": 420,
  "height": 96
}
```

An asset is optional. Screenshot capture is best-effort and a note must remain importable without it.

An importer must verify that:

- The path stays beneath `assets/`.
- The file exists exactly once.
- Its detected type agrees with the declared MIME type.
- Its size and decoded dimensions are within application limits.
- It is served or displayed as inert media, never executable content.

## Compatibility rules

- Consumers must reject unsupported top-level schema identifiers.
- Consumers should ignore unknown properties inside a supported schema.
- Required fields will not be removed or have their meaning changed within `qa-review/1`.
- New optional fields and enum values may be introduced only when existing consumers can safely treat them as unknown.
- A breaking change requires a new identifier such as `qa-review/2`.
- Generator versions describe implementation releases and do not change parsing behavior by themselves.

## Privacy interpretation

The current generator intentionally excludes cookies, existing site storage, form values, request headers, and request bodies. This declaration describes generator behavior; importers must still treat all received data as potentially sensitive and untrusted.

Do not place entire review documents in application logs or error trackers.
