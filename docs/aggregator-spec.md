# QAWELL Aggregator Specification

Status: Implemented MVP for HTML, JSON, Markdown, CSV, and Excel  
Package: `@qa-capture/aggregate`  
Aggregate schema: `qa-review-aggregate/1`

Normative JSON Schema: [`schemas/qa-review-aggregate-1.schema.json`](../schemas/qa-review-aggregate-1.schema.json)

## 1. Purpose

The aggregator accepts multiple `qa-review/1` ZIP archives, validates them independently, preserves their provenance, deduplicates repeated notes, and produces combined human- or machine-readable outputs.

Primary uses:

- Combine several reviewers into one deliverable
- Create an offline searchable review site
- Produce an Excel workbook for sorting and tracking
- Prepare consolidated Markdown for an AI coding agent
- Export CSV for generic imports
- Supply a normalized aggregate JSON object to other adapters

The aggregator does not modify source archives and does not infer ticket resolution or priority.

## 2. Command-line interface

```sh
npm run aggregate -- \
  --output ./combined-review \
  --format html,json,markdown,csv,xlsx \
  ./jane.zip ./michael.zip ./client.zip
```

Direct package invocation:

```sh
node packages/qa-aggregate/bin/qa-aggregate.mjs \
  -o ./combined-review \
  -f html,xlsx \
  ./reviews/*.zip
```

Outputs:

```text
combined-review/
├── index.html
├── aggregate.json
├── review.md
├── notes.csv
├── review.xlsx
└── assets/
```

## 3. Library interface

```js
import {
  parseReviewArchive,
  aggregateReviews,
  renderHtml,
  renderJson,
  renderMarkdown,
  renderCsv,
  renderXlsx
} from "@qa-capture/aggregate";
```

Parsing and aggregation are separate so adapters can use the validated aggregate without generating files.

## 4. Input validation

The current implementation:

- Limits archive byte size
- Limits file count
- Limits total uncompressed size
- Limits individual file size
- Limits compression ratio
- Supports stored and deflate ZIP entries
- Rejects encrypted entries
- Rejects unsupported compression
- Rejects absolute paths
- Rejects `..` traversal
- Rejects backslashes and drive paths
- Rejects symlinks
- Rejects duplicate and case-colliding paths
- Rejects ZIP64 archives
- Rejects files not declared by the review contract
- Verifies uncompressed sizes
- Verifies CRC-32
- Requires `manifest.json`
- Requires `qa-review/1`
- Requires `review.json`
- Checks essential review fields
- Rejects duplicate note and asset IDs
- Validates note-to-asset references
- Restricts asset paths beneath `assets/`
- Checks PNG, JPEG, and WebP file signatures

The standalone package currently uses focused structural validation. Hosted ingestion must additionally validate against the complete published JSON Schema and re-encode images.

## 5. Aggregate identity and deduplication

Each source archive records:

- Review ID
- Reviewer
- Review timing
- Origin
- Note count
- Source filename
- SHA-256 of the source archive
- Generator metadata

Each note uses:

```text
sourceKey = <review.header.id>:<note.id>
```

If the same source key appears more than once, the first occurrence is retained. The source archive list still records every supplied archive so duplicate inputs remain auditable.

The aggregate ID is derived from the sorted source archive digests. It is stable for the same set of byte-identical source archives regardless of input order.

## 6. Aggregate object

```json
{
  "schema": "qa-review-aggregate/1",
  "id": "aggregate_...",
  "generatedAt": "2026-09-27T18:00:00.000Z",
  "summary": {
    "reviewCount": 3,
    "noteCount": 18,
    "reviewerCount": 3,
    "pageCount": 7
  },
  "sources": [],
  "notes": [],
  "assets": []
}
```

Binary asset data exists only in the in-memory library representation. Serialized aggregate JSON contains asset metadata and relative paths, never base64 payloads.

## 7. HTML renderer

The MVP generates one offline `index.html` plus relative assets.

Features:

- Summary counts
- Search across note, reviewer, page, and target text
- Reviewer filtering
- Note-type filtering
- Screenshot display
- Capture-time viewport display
- Collapsible selector context
- Print styles
- No network requests

Security:

- JSON embedded in a non-executable `application/json` element
- `<` escaped before embedding
- User content inserted with `textContent`
- Captured HTML is not actively rendered
- Restrictive CSP blocks network connections and external resources
- Images load only from local relative paths or data URLs

Future HTML work:

- Page grouping toggle
- Reviewer grouping toggle
- Full technical-context panel
- Diagnostics view
- Duplicate/similarity review
- Status annotations stored separately from source data

## 8. Excel renderer

The dependency-free `.xlsx` writer currently produces:

- `Summary` sheet
- `Reviews` sheet
- `Notes` sheet

The Notes sheet includes source key, reviewer, timestamp, kind, page, feedback, capture dimensions, DPR, selector, and relative screenshot paths.

Future Excel work:

- Header styles and frozen rows
- Autofilters
- Column widths
- Hyperlinks
- Separate Diagnostics and Assets sheets
- Optional embedded thumbnails

## 9. Markdown renderer

Notes are grouped by page path. Each entry includes:

- Kind
- Reviewer
- Source sequence
- Exact feedback
- Source key
- URL
- Capture-time dimensions
- Selector
- Relative screenshot links

The Markdown output is appropriate for repository-local AI workflows after adding explicit untrusted-content instructions.

## 10. CSV renderer

CSV contains one note per row. It is UTF-8 text with RFC-style quoting for commas, quotes, and line breaks.

CSV cannot carry binary images. The assets column contains space-delimited relative paths.

## 11. PDF renderer

PDF is specified but not implemented in the dependency-free MVP.

Recommended implementation:

1. Generate safe aggregate HTML.
2. Open it in a pinned headless Chromium runtime.
3. Disable network access.
4. Print to PDF with background graphics.
5. Store or return the resulting PDF.

Do not build a separate unsafe HTML templating path solely for PDF.

## 12. Browser aggregator

A later browser UI can use the same library concepts:

1. Drag multiple ZIPs into the page.
2. Parse locally in a Web Worker.
3. Display validation results.
4. Select outputs.
5. Generate and download a combined result.

The Node implementation uses built-in Node ZIP/crypto primitives. A browser build will require platform adapters for decompression, hashing, and filesystem downloads while keeping validation semantics identical.

## 13. Hosted aggregator

The hosted service aggregates only approved canonical packages. It records:

- Aggregate ID
- Creating user
- Organization/project scope
- Selected review IDs
- Source canonical hashes
- Requested renderers
- Rendered output paths and hashes
- Creation and expiration times

Hosted aggregation jobs run asynchronously and never mutate individual reviews.

## 14. Testing requirements

Required fixtures and tests:

- Valid stored ZIP
- Valid deflated ZIP
- Several unique reviews
- Duplicate archive
- Duplicate source note key
- Missing manifest
- Unsupported schema
- Invalid JSON
- Missing asset
- MIME/signature mismatch
- CRC mismatch
- Absolute path
- Parent traversal
- Backslash path
- Duplicate/case-colliding path
- Symlink
- ZIP bomb ratio
- Excess files and bytes
- Hostile HTML and spreadsheet-formula text
- Output HTML with no network access
- XLSX readable by Excel, LibreOffice, and Google Sheets

Spreadsheet cells beginning with `=`, `+`, `-`, or `@` must remain strings and must never become formulas. The current inline-string XLSX implementation satisfies this; CSV consumers may still interpret such cells, so a configurable CSV formula-escaping mode should be added before untrusted public use.

## 15. Acceptance criteria

- Two valid archives produce one aggregate with two source records.
- Notes remain attributable to source review and reviewer.
- Duplicate source keys do not create duplicate aggregate notes.
- Per-note viewport width survives aggregation.
- Source archive SHA-256 values are recorded.
- Unsafe ZIPs fail before JSON parsing.
- HTML works offline and makes no network requests.
- HTML never actively renders captured markup.
- Excel contains Summary, Reviews, and Notes sheets.
- JSON excludes binary byte arrays.
- Missing optional screenshots do not block aggregation.
