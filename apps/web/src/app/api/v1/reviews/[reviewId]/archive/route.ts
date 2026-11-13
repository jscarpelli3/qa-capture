import { del } from "@vercel/blob";
import { hashToken } from "@/lib/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ingestReviewArchive, MAX_ARCHIVE_BYTES } from "@/lib/review-ingest";
import { projectAllowsRequestOrigin } from "@/lib/widget-project";

export const maxDuration = 60;

export async function POST(request: Request, { params }: RouteContext<"/api/v1/reviews/[reviewId]/archive">) {
  const { reviewId } = await params;
  const origin = request.headers.get("origin") || "";
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token || request.headers.get("content-type")?.split(";")[0] !== "application/zip") return json({ error: "A ZIP body and upload token are required." }, 400, origin);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_ARCHIVE_BYTES) return json({ error: "Archive exceeds the 4 MiB limit." }, 413, origin);
  const admin = createSupabaseAdminClient();
  const { data: review } = await admin.from("reviews").select("id,project_id,package_nonce_hash,package_nonce_consumed_at,upload_expires_at,status").eq("id", reviewId).maybeSingle();
  if (!review || review.package_nonce_hash !== hashToken(token) || review.package_nonce_consumed_at || new Date(review.upload_expires_at) <= new Date() || review.status !== "created") return json({ error: "Upload authorization is invalid or expired." }, 403, origin);
  if (!await projectAllowsRequestOrigin(review.project_id, origin)) return json({ error: "Upload origin is not authorized." }, 403, origin);
  const consumedAt = new Date().toISOString();
  const { data: consumed } = await admin.from("reviews").update({ package_nonce_consumed_at: consumedAt }).eq("id", reviewId).is("package_nonce_consumed_at", null).select("id").maybeSingle();
  if (!consumed) return json({ error: "Upload authorization was already used." }, 409, origin);

  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    const result = await ingestReviewArchive(reviewId, buffer, { deferDelivery: true });
    await removeFinalizedDraft(admin, reviewId);
    if (result.delivery.mode === "download") return new Response(result.archive, { status: 200, headers: { ...cors(origin), "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="qawell-review-${reviewId}.zip"`, "X-QAWELL-Notes": String(result.parsed.review.notes.length) } });
    if (result.delivery.queued) return json({ status: "queued", accepted: true, notes: result.parsed.review.notes.length }, 202, origin);
    return json({ status: "delivered", accepted: true, notes: result.parsed.review.notes.length, tickets: result.delivery.delivered, attachmentsDelivered: result.delivery.attachmentsDelivered || 0, attachmentsFailed: result.delivery.attachmentsFailed || 0 }, 200, origin);
  } catch (error) {
    const { data: failedReview } = await admin.from("reviews").select("status,approved_path").eq("id", reviewId).maybeSingle();
    if (failedReview?.approved_path) {
      await removeFinalizedDraft(admin, reviewId);
      return json({ status: failedReview.status, accepted: true, deliveryNeedsAttention: true, message: error instanceof Error ? error.message : "The retained review needs delivery attention." }, 202, origin);
    }
    if (failedReview?.status === "rejected" && !failedReview.approved_path) {
      await admin.from("reviews").update({ status: "created", package_nonce_consumed_at: null }).eq("id", reviewId).eq("status", "rejected");
    }
    const message = error instanceof Error ? error.message : "Review processing failed.";
    return json({ error: message }, 422, origin);
  }
}

async function removeFinalizedDraft(admin: ReturnType<typeof createSupabaseAdminClient>, reviewId: string) {
  const { data: assets, error } = await admin.from("review_assets").select("storage_path").eq("review_id", reviewId);
  if (error) {
    console.error("QAWELL could not inspect finalized draft assets.", { reviewId, error: error.message });
    return;
  }
  try {
    const paths = (assets || []).map((asset) => asset.storage_path);
    if (paths.length) await del(paths);
    const [assetDelete, noteDelete] = await Promise.all([
      admin.from("review_assets").delete().eq("review_id", reviewId),
      admin.from("review_notes").delete().eq("review_id", reviewId),
    ]);
    if (assetDelete.error || noteDelete.error) {
      console.error("QAWELL could not remove finalized draft rows.", { reviewId, assetError: assetDelete.error?.message, noteError: noteDelete.error?.message });
    }
  } catch (cleanupError) {
    console.error("QAWELL retained a finalized draft for later cleanup.", { reviewId, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
  }
}

export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: cors(request.headers.get("origin") || "*") }); }
function json(body: unknown, status: number, origin: string) { return Response.json(body, { status, headers: cors(origin) }); }
function cors(origin: string) { return { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Expose-Headers": "Content-Disposition,X-QAWELL-Notes", Vary: "Origin", "Cache-Control": "no-store" }; }
