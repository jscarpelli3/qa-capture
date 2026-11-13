import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";
import { authorizeDraftReview, draftCors, draftJson, MAX_DRAFT_ASSET_BYTES, validDraftId } from "@/lib/review-drafts";

export async function GET(request: Request, { params }: RouteContext<"/api/v1/reviews/[reviewId]/draft/assets/[assetId]">) {
  const { reviewId, assetId } = await params;
  const authorized = await authorizeDraftReview(request, reviewId);
  if ("error" in authorized) return authorized.error;
  if (!validDraftId(assetId, "asset")) return draftJson({ error: "Invalid screenshot." }, 400, authorized.origin);
  const { data: asset } = await authorized.admin.from("review_assets").select("storage_path,mime_type,file_size,sha256").eq("review_id", reviewId).eq("asset_id", assetId).maybeSingle();
  if (!asset) return draftJson({ error: "Screenshot not found." }, 404, authorized.origin);
  const stored = await get(asset.storage_path, { access: "private", useCache: false });
  if (!stored) return draftJson({ error: "Screenshot storage is unavailable." }, 404, authorized.origin);
  return new Response(stored.stream, { headers: { ...draftCors(authorized.origin), "Content-Type": asset.mime_type, "Content-Length": String(asset.file_size), ETag: `"${asset.sha256}"` } });
}

export async function PUT(request: Request, { params }: RouteContext<"/api/v1/reviews/[reviewId]/draft/assets/[assetId]">) {
  const { reviewId, assetId } = await params;
  const authorized = await authorizeDraftReview(request, reviewId);
  if ("error" in authorized) return authorized.error;
  if (!validDraftId(assetId, "asset")) return draftJson({ error: "Invalid screenshot." }, 400, authorized.origin);
  const declaredMime = request.headers.get("content-type")?.split(";")[0] || "";
  if (!ALLOWED_MIME.has(declaredMime)) return draftJson({ error: "Use a PNG, JPEG, or WebP screenshot." }, 415, authorized.origin);
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_DRAFT_ASSET_BYTES) return draftJson({ error: "Screenshot must be 2 MB or smaller." }, 413, authorized.origin);
  const data = Buffer.from(await request.arrayBuffer());
  if (!data.length || data.length > MAX_DRAFT_ASSET_BYTES || sniffMime(data) !== declaredMime) return draftJson({ error: "The screenshot file is invalid." }, 422, authorized.origin);

  const extension = declaredMime === "image/jpeg" ? "jpg" : declaredMime === "image/png" ? "png" : "webp";
  const storagePath = `drafts/${authorized.review.project_id}/${reviewId}/${assetId}.${extension}`;
  const fileNameHeader = request.headers.get("x-qawell-file-name") || `${assetId}.${extension}`;
  let decodedFileName = fileNameHeader;
  try { decodedFileName = decodeURIComponent(fileNameHeader); } catch { /* Keep the literal header when it is not URI encoded. */ }
  const fileName = decodedFileName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 200) || `${assetId}.${extension}`;
  const sha256 = createHash("sha256").update(data).digest("hex");
  try {
    await put(storagePath, data, { access: "private", contentType: declaredMime, addRandomSuffix: false, allowOverwrite: true });
  } catch {
    return draftJson({ error: "Could not store the screenshot." }, 502, authorized.origin);
  }
  const now = new Date().toISOString();
  const { error } = await authorized.admin.from("review_assets").upsert({ review_id: reviewId, asset_id: assetId, storage_path: storagePath, file_name: fileName, mime_type: declaredMime, file_size: data.length, sha256, updated_at: now }, { onConflict: "review_id,asset_id" });
  if (error) return draftJson({ error: "The screenshot was stored, but its draft record could not be saved." }, 500, authorized.origin);
  return draftJson({ saved: true, assetId, mimeType: declaredMime, fileSize: data.length, sha256, updatedAt: now }, 200, authorized.origin);
}

export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: draftCors(request.headers.get("origin") || "*") }); }

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function sniffMime(data: Buffer) {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
