import "server-only";
import { get } from "@vercel/blob";
import { parseReviewArchive } from "@qa-capture/aggregate";
import { AgencyBrainDeliveryError } from "@/lib/agency-brain-delivery";
import { deliverReview } from "@/lib/delivery-adapters/deliver-review";
import { MAX_DELIVERY_ATTEMPTS, type ReviewDeliveryMessage } from "@/lib/review-delivery-queue";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export class DeliveryRetryError extends Error {
  constructor(message: string, public afterSeconds: number) {
    super(message);
    this.name = "DeliveryRetryError";
  }
}

export async function processReviewDelivery(message: ReviewDeliveryMessage, queueMessageId: string) {
  if (message.version !== 1 || !message.jobId || !message.reviewId || !message.noteId) return;
  const admin = createSupabaseAdminClient();
  const { data: job } = await admin.from("review_delivery_jobs").select("id,review_id,note_id,status,attempts").eq("id", message.jobId).maybeSingle();
  if (!job || job.review_id !== message.reviewId || job.note_id !== message.noteId || ["succeeded", "permanent_failure"].includes(job.status)) return;

  const { data: claimed, error: claimError } = await admin.rpc("claim_review_delivery_job", { job_id: job.id });
  if (claimError) throw new DeliveryRetryError("The delivery job could not be claimed.", 15);
  if (!claimed) throw new DeliveryRetryError("Another QA note is currently being delivered.", 5);

  const attempt = job.attempts + 1;
  await admin.from("review_delivery_jobs").update({ queue_message_id: queueMessageId, updated_at: new Date().toISOString() }).eq("id", job.id);
  try {
    const { data: review } = await admin.from("reviews").select("approved_path,status").eq("id", job.review_id).maybeSingle();
    if (!review?.approved_path) throw new AgencyBrainDeliveryError("The retained QA package is unavailable.", "approved_package_missing", false);
    const stored = await get(review.approved_path, { access: "private", useCache: false });
    if (!stored) throw new AgencyBrainDeliveryError("The retained QA package could not be read.", "approved_package_missing", false);
    const archive = Buffer.from(await new Response(stored.stream).arrayBuffer());
    const parsed = parseReviewArchive(archive, `${job.review_id}.zip`);
    await deliverReview(job.review_id, parsed.review, parsed.assetsById, { noteId:job.note_id, reconcile:attempt > 1 });
    await admin.from("review_delivery_jobs").update({ status:"succeeded", completed_at:new Date().toISOString(), updated_at:new Date().toISOString(), last_error_code:null, last_error_message:null }).eq("id", job.id);
    await refreshReviewDeliveryStatus(job.review_id);
  } catch (error) {
    const providerError = error instanceof AgencyBrainDeliveryError ? error : null;
    const permanent = providerError ? !providerError.retryable : attempt >= MAX_DELIVERY_ATTEMPTS;
    const code = providerError?.code || "delivery_worker_error";
    const messageText = error instanceof Error ? error.message.slice(0, 500) : "Delivery worker failed";
    if (permanent || attempt >= MAX_DELIVERY_ATTEMPTS) {
      await admin.from("review_delivery_jobs").update({ status:"permanent_failure", completed_at:new Date().toISOString(), updated_at:new Date().toISOString(), last_error_code:code, last_error_message:messageText }).eq("id", job.id);
      await refreshReviewDeliveryStatus(job.review_id);
      return;
    }
    const afterSeconds = Math.min(30 * 60, providerError?.retryAfterSeconds || 2 ** attempt * 5);
    await admin.from("review_delivery_jobs").update({ status:"retry_scheduled", next_attempt_at:new Date(Date.now() + afterSeconds * 1000).toISOString(), updated_at:new Date().toISOString(), last_error_code:code, last_error_message:messageText }).eq("id", job.id);
    await refreshReviewDeliveryStatus(job.review_id);
    throw new DeliveryRetryError(messageText, afterSeconds);
  }
}

async function refreshReviewDeliveryStatus(reviewId: string) {
  const admin = createSupabaseAdminClient();
  const { data: jobs, error } = await admin.from("review_delivery_jobs").select("status").eq("review_id", reviewId);
  if (error || !jobs?.length) return;
  const status = jobs.some((job) => job.status === "permanent_failure")
    ? "delivery_failed"
    : jobs.every((job) => job.status === "succeeded")
      ? "delivered"
      : jobs.some((job) => job.status === "processing")
        ? "delivering"
        : "queued";
  await admin.from("reviews").update({ status, rejection_code:status === "delivery_failed" ? "delivery_job_failed" : null }).eq("id", reviewId).in("status", ["queued", "delivering", "delivery_failed"]);
}
