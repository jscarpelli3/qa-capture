import "server-only";
import { del, get, put } from "@vercel/blob";
import { parseReviewArchive, ArchiveError } from "@qa-capture/aggregate";
import { deliverReviewToAgencyBrain } from "@/lib/agency-brain-delivery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { QawellReview } from "@qa-capture/aggregate";

export const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;

export async function ingestReviewArchive(reviewId: string, input: Buffer) {
  if (!input.length || input.length > MAX_ARCHIVE_BYTES) throw new IngestError("ARCHIVE_SIZE", "The review archive must be between 1 byte and 4 MiB.");
  const admin = createSupabaseAdminClient();
  const pathname = `quarantine/${reviewId}/${crypto.randomUUID()}.zip`;
  let storedPath: string | null = null;
  try {
    await admin.from("reviews").update({ status: "uploading", quarantine_path: pathname }).eq("id", reviewId);
    const blob = await put(pathname, input, { access: "private", contentType: "application/zip", addRandomSuffix: false, allowOverwrite: false });
    storedPath = blob.pathname;
    await admin.from("reviews").update({ status: "uploaded", quarantine_path: storedPath }).eq("id", reviewId);
    const stored = await get(storedPath, { access: "private", useCache: false });
    if (!stored) throw new IngestError("BLOB_MISSING", "The uploaded review could not be read back.");
    const scannedBuffer = Buffer.from(await new Response(stored.stream).arrayBuffer());
    await admin.from("reviews").update({ status: "validating" }).eq("id", reviewId);
    const parsed = parseReviewArchive(scannedBuffer, `${reviewId}.zip`);
    validateReviewContent(parsed.review);
    const { data: reviewRecord } = await admin.from("reviews").select("project_id,invitation_id,reviewer_name,reviewer_email,delivery_mode").eq("id", reviewId).single();
    if (!reviewRecord) throw new IngestError("REVIEW_MISSING", "Review record not found.");
    if (reviewRecord.delivery_mode === "integration" && parsed.review.notes.length > 25) {
      throw new IngestError("INTEGRATION_NOTE_LIMIT", "Agency Brain delivery currently supports up to 25 notes per review.");
    }
    await assertReviewOrigins(admin, reviewRecord.project_id, parsed.review);
    const { error: approvalError } = await admin.from("reviews").update({
      source_review_id: parsed.review.header.id,
      reviewer_name: reviewRecord.reviewer_name || parsed.review.header?.reviewer?.name || null,
      status: "approved",
      canonical_sha256: parsed.archiveSha256,
      note_count: parsed.review.notes.length,
      approved_at: new Date().toISOString(),
      quarantine_path: null,
    }).eq("id", reviewId);
    if (approvalError) throw new IngestError("DUPLICATE_REVIEW", "This review package has already been submitted.");

    let delivery = { delivered: 0, mode: "download" as "download" | "integration" };
    if (reviewRecord.delivery_mode === "integration") {
      await admin.from("reviews").update({ status: "delivering" }).eq("id", reviewId);
      try {
        delivery = await deliverReviewToAgencyBrain(reviewId, parsed.review);
        await admin.from("reviews").update({ status: "delivered" }).eq("id", reviewId);
      } catch (error) {
        await admin.from("reviews").update({ status: "delivery_failed", rejection_code: error instanceof Error ? error.message.slice(0, 200) : "delivery_failed" }).eq("id", reviewId);
        throw new IngestError("DELIVERY_FAILED", "The review was validated, but its integration delivery failed.");
      }
    }
    if (reviewRecord.invitation_id) {
      const { data: invitation } = await admin.from("invitations").select("accepted_reviews,max_reviews").eq("id", reviewRecord.invitation_id).single();
      const accepted = (invitation?.accepted_reviews || 0) + 1;
      await admin.from("invitations").update({ accepted_reviews: accepted, submitted_at: new Date().toISOString(), status: accepted >= (invitation?.max_reviews || 1) ? "exhausted" : "partially_used" }).eq("id", reviewRecord.invitation_id);
    }
    return { parsed, delivery, archive: scannedBuffer };
  } catch (error) {
    if (!(error instanceof IngestError && error.code === "DELIVERY_FAILED")) {
      const code = error instanceof ArchiveError || error instanceof IngestError ? error.code : "VALIDATION_FAILED";
      await admin.from("reviews").update({ status: "rejected", rejection_code: code }).eq("id", reviewId);
    }
    throw error;
  } finally {
    if (storedPath) await del(storedPath).catch(() => undefined);
  }
}

class IngestError extends Error { constructor(public code: string, message: string) { super(message); this.name = "IngestError"; } }

function validateReviewContent(review: QawellReview) {
  if (review.notes.length > 200) throw new IngestError("TOO_MANY_NOTES", "A review may contain at most 200 notes.");
  for (const note of review.notes) {
    if (typeof note.text !== "string" || note.text.length > 10_000) throw new IngestError("NOTE_TOO_LONG", "A review note exceeds 10,000 characters.");
    if (typeof note.target?.html === "string" && note.target.html.length > 10_000) throw new IngestError("HTML_TOO_LONG", "Captured HTML exceeds 10,000 characters.");
  }
}

async function assertReviewOrigins(admin: ReturnType<typeof createSupabaseAdminClient>, projectId: string, review: QawellReview) {
  const { data: origins } = await admin.from("project_origins").select("origin").eq("project_id", projectId);
  const allowed = new Set((origins || []).map((item) => item.origin));
  const urls = [review.header?.platform?.page?.url, ...review.notes.map((note) => note.page?.url)].filter((value): value is string => typeof value === "string" && value.length > 0);
  for (const value of urls) {
    let origin;
    try { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); origin = url.origin; }
    catch { throw new IngestError("INVALID_CAPTURE_URL", "The review contains an invalid page URL."); }
    if (!allowed.has(origin)) throw new IngestError("ORIGIN_MISMATCH", "The review contains a page outside the project’s verified origin.");
  }
}
