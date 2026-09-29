#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";
import { aggregateReviews, parseReviewArchive, renderCsv, renderHtml, renderJson, renderMarkdown, renderXlsx } from "../src/index.mjs";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(args.length ? 0 : 1);
}

const options = parseArgs(args);
if (!options.inputs.length) fail("Provide at least one QAWELL ZIP archive.");
const outputDir = resolve(options.output);
await mkdir(outputDir, { recursive: true });

const parsed = [];
for (const inputPath of options.inputs) {
  try {
    parsed.push(parseReviewArchive(await readFile(inputPath), basename(inputPath)));
  } catch (error) {
    fail(`${inputPath}: ${error.code ? `${error.code}: ` : ""}${error.message}`);
  }
}

const aggregate = aggregateReviews(parsed);
const formats = new Set(options.formats);
const writes = [];
if (formats.has("json")) writes.push(writeFile(`${outputDir}/aggregate.json`, renderJson(aggregate)));
if (formats.has("markdown") || formats.has("md")) writes.push(writeFile(`${outputDir}/review.md`, renderMarkdown(aggregate)));
if (formats.has("csv")) writes.push(writeFile(`${outputDir}/notes.csv`, renderCsv(aggregate)));
if (formats.has("html")) writes.push(writeFile(`${outputDir}/index.html`, renderHtml(aggregate)));
if (formats.has("xlsx") || formats.has("excel")) writes.push(writeFile(`${outputDir}/review.xlsx`, renderXlsx(aggregate)));
for (const asset of aggregate.assets) {
  const destination = `${outputDir}/${asset.path}`;
  await mkdir(destination.slice(0, destination.lastIndexOf("/")), { recursive: true });
  writes.push(writeFile(destination, asset.data));
}
await Promise.all(writes);
console.log(`Aggregated ${aggregate.summary.reviewCount} reviews and ${aggregate.summary.noteCount} notes into ${outputDir}`);

function parseArgs(values) {
  const result = { output: "qa-aggregate-output", formats: ["html", "json", "markdown", "csv", "xlsx"], inputs: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--output" || value === "-o") result.output = values[++index] || fail("--output requires a directory");
    else if (value === "--format" || value === "-f") result.formats = (values[++index] || "").split(",").filter(Boolean);
    else if (value.startsWith("-")) fail(`Unknown option: ${value}`);
    else result.inputs.push(value);
  }
  const allowed = new Set(["html", "json", "markdown", "md", "csv", "xlsx", "excel"]);
  for (const format of result.formats) if (!allowed.has(format)) fail(`Unknown format: ${format}`);
  return result;
}

function usage() {
  console.log(`Usage: qa-aggregate [options] <review.zip...>

Options:
  -o, --output <directory>       Output directory (default: qa-aggregate-output)
  -f, --format <formats>         Comma-separated html,json,markdown,csv,xlsx
  -h, --help                     Show this help
`);
}

function fail(message) {
  console.error(`qa-aggregate: ${message}`);
  process.exit(1);
}
