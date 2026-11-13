import "server-only";
import { sendBatch } from "@vercel/queue";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const REVIEW_DELIVERY_TOPIC = "qawell-review-delivery-v1";
export const MAX_DELIVERY_ATTEMPTS = 8;

export type ReviewDeliveryMessage = {
  version: 1;
  jobId: string;
  reviewId: string;
  noteId: string;
};

export async function queueReviewDelivery(reviewId: string, noteIds: string[]) {
  const admin = createSupabaseAdminClient();
  const rows = noteIds.map((noteId) => ({ review_id: reviewId, note_id: noteId, status: "queued", next_attempt_at: new Date().toISOString() }));
  const { error: insertError } = await admin.from("review_delivery_jobs").upsert(rows, { onConflict: "review_id,note_id", ignoreDuplicates: true });
  if (insertError) throw new Error("Could not create the delivery jobs.");
  const { data: jobs, error: jobsError } = await admin.from("review_delivery_jobs").select("id,review_id,note_id,status,queue_message_id").eq("review_id", reviewId).in("note_id", noteIds);
  if (jobsError || !jobs || jobs.length !== noteIds.length) throw new Error("Could not load the delivery jobs.");
  await dispatchDeliveryJobs(jobs.filter((job) => !job.queue_message_id && job.status === "queued"));
  return jobs.length;
}

export async function dispatchPendingDeliveryJobs(limit = 100) {
  const admin = createSupabaseAdminClient();
  const { data: jobs, error } = await admin.from("review_delivery_jobs")
    .select("id,review_id,note_id,status,queue_message_id")
    .in("status", ["queued", "retry_scheduled"])
    .is("queue_message_id", null)
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error("Could not load pending delivery jobs.");
  return dispatchDeliveryJobs(jobs || []);
}

async function dispatchDeliveryJobs(jobs: Array<{ id: string; review_id: string; note_id: string }>) {
  if (!jobs.length) return { dispatched: 0, failed: 0 };
  const admin = createSupabaseAdminClient();
  const results = await sendBatch(REVIEW_DELIVERY_TOPIC, jobs.map((job) => ({
    payload: { version: 1, jobId: job.id, reviewId: job.review_id, noteId: job.note_id } satisfies ReviewDeliveryMessage,
    idempotencyKey: `qawell-delivery:${job.id}`,
    retentionSeconds: 7 * 24 * 60 * 60,
  })));
  let dispatched = 0;
  let failed = 0;
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const result = results[index];
    if (result.status === "sent" || result.status === "deferred") {
      dispatched += 1;
      await admin.from("review_delivery_jobs").update({ queue_message_id: result.messageId || "deferred", updated_at: new Date().toISOString(), last_error_code: null, last_error_message: null }).eq("id", job.id).is("queue_message_id", null);
    } else {
      failed += 1;
      await admin.from("review_delivery_jobs").update({ last_error_code: `queue_publish_${result.statusCode}`, last_error_message: result.error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", job.id);
    }
  }
  return { dispatched, failed };
}
