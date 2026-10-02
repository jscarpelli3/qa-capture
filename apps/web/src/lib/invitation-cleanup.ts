import "server-only";
import { del } from "@vercel/blob";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Centralizes invitation cleanup so future retained review packages are removed
 * alongside their database records. Integration tickets already delivered to
 * third-party systems are intentionally outside this deletion boundary.
 */
export async function deleteInvitation(invitationId: string, deleteReviews: boolean) {
  const admin = createSupabaseAdminClient();
  let deletedReviews = 0;

  await admin.from("reviews").update({ status: "rejected", rejection_code: "invitation_deleted" }).eq("invitation_id", invitationId).eq("status", "created");

  if (deleteReviews) {
    const { data: reviews, error: reviewLookupError } = await admin.from("reviews")
      .select("id,quarantine_path,approved_path")
      .eq("invitation_id", invitationId);
    if (reviewLookupError) throw new Error("Could not inspect this invitation’s QA records.");

    const reviewIds = (reviews || []).map((review) => review.id);
    if (reviewIds.length) {
      const { error: reviewDeleteError } = await admin.from("reviews").delete().in("id", reviewIds);
      if (reviewDeleteError) throw new Error("Could not delete this invitation’s QA records.");
      deletedReviews = reviewIds.length;
    }

    const blobPaths = (reviews || []).flatMap((review) => [review.quarantine_path, review.approved_path]).filter((path): path is string => Boolean(path));
    if (blobPaths.length) await del(blobPaths).catch((error) => console.error("QA records were deleted, but retained package cleanup failed.", error));
  }

  const { error: invitationDeleteError } = await admin.from("invitations").delete().eq("id", invitationId);
  if (invitationDeleteError) throw new Error("Could not delete the invitation.");
  return { deletedReviews };
}
