import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { aggregateReviews, createZip, parseReviewArchive, readZip, renderCsv, renderHtml, renderMarkdown, renderXlsx } from "../src/index.mjs";

const exampleReviewUrl = new URL("../../../examples/qa-review-1/review.json", import.meta.url);
const exampleManifestUrl = new URL("../../../examples/qa-review-1/manifest.json", import.meta.url);

async function exampleArchive() {
  return createZip([
    { name: "manifest.json", data: await readFile(exampleManifestUrl) },
    { name: "review.json", data: await readFile(exampleReviewUrl) },
  ]);
}

test("parses and aggregates a valid QA Capture archive", async () => {
  const parsed = parseReviewArchive(await exampleArchive(), "example.zip");
  const aggregate = aggregateReviews([parsed]);
  assert.equal(aggregate.schema, "qa-review-aggregate/1");
  assert.equal(aggregate.summary.reviewCount, 1);
  assert.equal(aggregate.summary.noteCount, 1);
  assert.equal(aggregate.notes[0].viewport.width, 390);
  assert.equal(aggregate.notes[0].sourceKey, "review_example_001:note_example_001");
});

test("deduplicates the same source review and note", async () => {
  const parsed = parseReviewArchive(await exampleArchive(), "example.zip");
  const aggregate = aggregateReviews([parsed, parsed]);
  assert.equal(aggregate.summary.reviewCount, 2);
  assert.equal(aggregate.summary.noteCount, 1);
});

test("rejects traversal paths", async () => {
  const archive = createZip([{ name: "../review.json", data: "{}" }]);
  assert.throws(() => readZip(archive), (error) => error.code === "PATH_TRAVERSAL");
});

test("rejects unreferenced files", async () => {
  const archive = createZip([
    { name: "manifest.json", data: await readFile(exampleManifestUrl) },
    { name: "review.json", data: await readFile(exampleReviewUrl) },
    { name: "unexpected.html", data: "<script>alert(1)</script>" },
  ]);
  assert.throws(() => parseReviewArchive(archive), (error) => error.code === "UNEXPECTED_FILE");
});

test("renders HTML, Markdown, CSV, and a readable XLSX archive", async () => {
  const aggregate = aggregateReviews([parseReviewArchive(await exampleArchive())]);
  assert.match(renderHtml(aggregate), /Combined QA Review/);
  assert.match(renderMarkdown(aggregate), /Change this button/);
  assert.match(renderCsv(aggregate), /source_key/);
  const xlsxFiles = readZip(renderXlsx(aggregate));
  assert.ok(xlsxFiles.has("xl/workbook.xml"));
  assert.ok(xlsxFiles.has("xl/worksheets/sheet3.xml"));
});

test("neutralizes spreadsheet formulas in CSV output", async () => {
  const aggregate = aggregateReviews([parseReviewArchive(await exampleArchive())]);
  aggregate.notes[0].text = "=HYPERLINK(\"https://example.test\")";
  assert.match(renderCsv(aggregate), /'=HYPERLINK/);
});
