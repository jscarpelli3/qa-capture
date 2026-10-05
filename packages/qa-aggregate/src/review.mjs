import { createHash } from "node:crypto";
import { readZip, ArchiveError } from "./zip.mjs";

const ALLOWED_ASSET_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export function parseReviewArchive(input, sourceName = "review.zip") {
  const archive = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const files = readZip(archive);
  const manifest = parseJson(files, "manifest.json");
  if (manifest.schema !== "qa-review/1") throw new ReviewError("UNSUPPORTED_SCHEMA", `Unsupported manifest schema: ${manifest.schema}`);
  if (manifest.reviewFile !== "review.json") throw new ReviewError("INVALID_MANIFEST", "qa-review/1 requires reviewFile to be review.json");
  const review = parseJson(files, manifest.reviewFile);
  validateReview(review);

  const assetsById = new Map();
  const assetPaths = new Set();
  for (const asset of review.assets) {
    if (!asset || typeof asset !== "object" || typeof asset.id !== "string" || typeof asset.path !== "string") {
      throw new ReviewError("INVALID_ASSET", "Every asset requires string id and path fields");
    }
    if (assetsById.has(asset.id)) throw new ReviewError("DUPLICATE_ASSET_ID", `Duplicate asset ID: ${asset.id}`);
    if (assetPaths.has(asset.path.toLocaleLowerCase("en-US"))) throw new ReviewError("DUPLICATE_ASSET_PATH", `Duplicate asset path: ${asset.path}`);
    if (!/^assets\/[A-Za-z0-9._-]+$/.test(asset.path)) throw new ReviewError("INVALID_ASSET_PATH", `Unsafe asset path: ${asset.path}`);
    if (!ALLOWED_ASSET_MIME.has(asset.mime)) throw new ReviewError("INVALID_ASSET_MIME", `Unsupported asset MIME type: ${asset.mime}`);
    const data = files.get(asset.path);
    if (!data) throw new ReviewError("MISSING_ASSET", `Missing asset file: ${asset.path}`);
    verifyImageSignature(data, asset.mime, asset.path);
    assetsById.set(asset.id, { ...asset, data });
    assetPaths.add(asset.path.toLocaleLowerCase("en-US"));
  }

  for (const path of files.keys()) {
    if (path !== "manifest.json" && path !== "review.json" && path !== "delivery-map.json" && !assetPaths.has(path.toLocaleLowerCase("en-US"))) {
      throw new ReviewError("UNEXPECTED_FILE", `Archive contains an unexpected file: ${path}`);
    }
  }

  const noteIds = new Set();
  for (const note of review.notes) {
    if (noteIds.has(note.id)) throw new ReviewError("DUPLICATE_NOTE_ID", `Duplicate note ID: ${note.id}`);
    noteIds.add(note.id);
    for (const assetId of note.assets || []) {
      if (!assetsById.has(assetId)) throw new ReviewError("UNKNOWN_ASSET_REFERENCE", `Note ${note.id} references unknown asset ${assetId}`);
    }
  }

  const deliveryMap = files.has("delivery-map.json") ? parseJson(files, "delivery-map.json") : null;
  if (deliveryMap) validateDeliveryMap(deliveryMap, noteIds);

  return {
    sourceName,
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    manifest,
    review,
    assetsById,
    deliveryMap,
  };
}

export class ReviewError extends ArchiveError {
  constructor(code, message) {
    super(code, message);
    this.name = "ReviewError";
  }
}

function parseJson(files, path) {
  const data = files.get(path);
  if (!data) throw new ReviewError("MISSING_FILE", `Archive is missing ${path}`);
  try {
    return JSON.parse(data.toString("utf8"));
  } catch (error) {
    throw new ReviewError("INVALID_JSON", `${path} is not valid JSON: ${error.message}`);
  }
}

function validateReview(review) {
  if (!review || typeof review !== "object") throw new ReviewError("INVALID_REVIEW", "review.json must contain an object");
  if (review.schema !== "qa-review/1") throw new ReviewError("UNSUPPORTED_SCHEMA", `Unsupported review schema: ${review.schema}`);
  requireObject(review.header, "header");
  requireString(review.header.id, "header.id");
  requireObject(review.header.reviewer, "header.reviewer");
  requireString(review.header.reviewer.name, "header.reviewer.name");
  requireObject(review.header.timing, "header.timing");
  requireString(review.header.timing.startedAt, "header.timing.startedAt");
  requireString(review.header.timing.exportedAt, "header.timing.exportedAt");
  if (!Array.isArray(review.notes)) throw new ReviewError("INVALID_REVIEW", "notes must be an array");
  if (!Array.isArray(review.assets)) throw new ReviewError("INVALID_REVIEW", "assets must be an array");
  for (const [index, note] of review.notes.entries()) validateNote(note, index);
}

function validateNote(note, index) {
  const prefix = `notes[${index}]`;
  requireObject(note, prefix);
  requireString(note.id, `${prefix}.id`);
  requireString(note.text, `${prefix}.text`);
  requireString(note.kind, `${prefix}.kind`);
  requireString(note.createdAt, `${prefix}.createdAt`);
  requireObject(note.page, `${prefix}.page`);
  requireString(note.page.path, `${prefix}.page.path`);
  requireObject(note.target, `${prefix}.target`);
  requireObject(note.viewport, `${prefix}.viewport`);
  if (typeof note.viewport.width !== "number" || typeof note.viewport.height !== "number") {
    throw new ReviewError("INVALID_REVIEW", `${prefix}.viewport requires numeric width and height`);
  }
  if (!Array.isArray(note.assets)) throw new ReviewError("INVALID_REVIEW", `${prefix}.assets must be an array`);
}

function validateDeliveryMap(deliveryMap, noteIds) {
  if (!deliveryMap || typeof deliveryMap !== "object" || Array.isArray(deliveryMap)) throw new ReviewError("INVALID_DELIVERY_MAP", "delivery-map.json must contain an object");
  if (deliveryMap.schema !== "qawell-delivery-map/1") throw new ReviewError("INVALID_DELIVERY_MAP", "Unsupported delivery map schema");
  if (!Array.isArray(deliveryMap.deliveries)) throw new ReviewError("INVALID_DELIVERY_MAP", "delivery-map.json requires a deliveries array");
  const mappedNotes = new Set();
  for (const [index, delivery] of deliveryMap.deliveries.entries()) {
    if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) throw new ReviewError("INVALID_DELIVERY_MAP", `deliveries[${index}] must be an object`);
    requireString(delivery.noteId, `deliveries[${index}].noteId`);
    if (!noteIds.has(delivery.noteId)) throw new ReviewError("INVALID_DELIVERY_MAP", `Delivery references unknown note ${delivery.noteId}`);
    if (mappedNotes.has(delivery.noteId)) throw new ReviewError("INVALID_DELIVERY_MAP", `Duplicate delivery for note ${delivery.noteId}`);
    mappedNotes.add(delivery.noteId);
  }
}

function requireObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewError("INVALID_REVIEW", `${path} must be an object`);
}

function requireString(value, path) {
  if (typeof value !== "string" || !value.length) throw new ReviewError("INVALID_REVIEW", `${path} must be a non-empty string`);
}

function verifyImageSignature(data, mime, path) {
  const valid = mime === "image/png"
    ? data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === "image/jpeg"
      ? data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      : data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  if (!valid) throw new ReviewError("ASSET_SIGNATURE_MISMATCH", `${path} does not match declared type ${mime}`);
}
