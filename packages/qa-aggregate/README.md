# `@qa-capture/aggregate`

Dependency-free Node.js tooling for validating and combining multiple QAWELL ZIP archives.

## Run from this repository

```sh
npm run aggregate -- \
  --output ./combined-review \
  --format html,json,markdown,csv,xlsx \
  ./review-one.zip ./review-two.zip
```

Generated files:

```text
combined-review/
├── index.html
├── aggregate.json
├── review.md
├── notes.csv
├── review.xlsx
└── assets/
```

Open `index.html` locally to browse and filter the combined review.

## Library use

```js
import { readFile } from "node:fs/promises";
import {
  parseReviewArchive,
  aggregateReviews,
  renderHtml
} from "@qa-capture/aggregate";

const parsed = await Promise.all(
  paths.map(async (path) => parseReviewArchive(await readFile(path), path))
);

const aggregate = aggregateReviews(parsed);
const html = renderHtml(aggregate);
```

See [`docs/aggregator-spec.md`](../../docs/aggregator-spec.md) for validation, security, and format details.
