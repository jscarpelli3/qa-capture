import { createOpaqueToken, hashToken, tokenMatches } from "@/lib/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWidgetProject, widgetConfig } from "@/lib/widget-project";

type StartReviewBody = {
  projectKey?: string;
  invitationToken?: string;
  origin?: string;
  reviewerName?: string;
  resumeReviewId?: string;
  resumeToken?: string;
  recoverByName?: boolean;
};

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin") || "";
  let body: StartReviewBody;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400, requestOrigin); }
  if (!body.projectKey || !body.invitationToken || !body.origin) return json({ error: "Project, origin, and invitation are required." }, 400, requestOrigin);

  const record = await getWidgetProject(body.projectKey, body.origin).catch(() => null);
  if (!record || requestOrigin !== record.origin) return json({ error: "Project origin is not authorized." }, 403, requestOrigin);
  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin.from("invitations").select("id,email,reviewer_name,status,expires_at,max_reviews,accepted_reviews,staging_url,link_type").eq("project_id", record.project.id).eq("secret_hash", hashToken(body.invitationToken)).maybeSingle();
  const isShared = invitation?.link_type === "shared";
  const unavailableIndividual = Boolean(invitation && !isShared && (!invitation.expires_at || invitation.max_reviews == null || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.accepted_reviews >= invitation.max_reviews));
  if (!invitation || unavailableIndividual || ["revoked", "expired", "exhausted"].includes(invitation.status)) {
    return json({ error: "This review link is invalid or unavailable." }, 403, record.origin);
  }

  const suppliedReviewer = cleanReviewerName(body.reviewerName);
  const reviewerName = invitation.reviewer_name || suppliedReviewer;

  if (body.resumeReviewId && body.resumeToken) {
    const { data: resumable } = await admin.from("reviews")
      .select("id,resume_secret_hash,status")
      .eq("id", body.resumeReviewId)
      .eq("project_id", record.project.id)
      .eq("invitation_id", invitation.id)
      .maybeSingle();
    if (!resumable?.resume_secret_hash || !tokenMatches(body.resumeToken, resumable.resume_secret_hash) || resumable.status !== "created") {
      return json({ error: "This saved review can no longer be resumed.", code: "RESUME_INVALID" }, 403, record.origin);
    }
    return refreshReview(admin, resumable.id, body.resumeToken, reviewerName, record, record.origin, true);
  }

  if (isShared && body.recoverByName && reviewerName && reviewerName !== "Bob Sacamano") {
    const { data: namedDraft } = await admin.from("reviews")
      .select("id")
      .eq("project_id", record.project.id)
      .eq("invitation_id", invitation.id)
      .eq("status", "created")
      .eq("reviewer_name", reviewerName)
      .gt("draft_revision", 0)
      .order("draft_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (namedDraft) {
      const resumeToken = createOpaqueToken();
      const { error: resumeSecretError } = await admin.from("reviews").update({ resume_secret_hash: hashToken(resumeToken) }).eq("id", namedDraft.id).eq("status", "created");
      if (resumeSecretError) return json({ error: "Could not recover the saved review." }, 500, record.origin);
      return refreshReview(admin, namedDraft.id, resumeToken, reviewerName, record, record.origin, true);
    }
  }

  if (!isShared && invitation.status === "started") {
    const { data: activeReview } = await admin.from("reviews").select("id").eq("invitation_id", invitation.id).eq("status", "created").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (activeReview) {
      const resumeToken = createOpaqueToken();
      const { error: resumeSecretError } = await admin.from("reviews").update({ resume_secret_hash: hashToken(resumeToken) }).eq("id", activeReview.id).eq("status", "created");
      if (resumeSecretError) return json({ error: "Could not reconnect this review." }, 500, record.origin);
      return refreshReview(admin, activeReview.id, resumeToken, reviewerName, record, record.origin, true);
    }
  }

  if (!isShared) {
    const { data: claimed } = await admin.from("invitations").update({ status: "started" })
      .eq("id", invitation.id)
      .eq("accepted_reviews", invitation.accepted_reviews)
      .in("status", ["draft", "sent", "opened", "partially_used", "delivery_failed"])
      .select("id").maybeSingle();
    if (!claimed) return json({ error: "This invitation is already active in another review. Generate a new link if the previous session was abandoned." }, 409, record.origin);
  }

  const uploadToken = createOpaqueToken();
  const resumeToken = createOpaqueToken();
  const uploadExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: review, error } = await admin.from("reviews").insert({
    project_id: record.project.id,
    invitation_id: invitation.id,
    reviewer_email: invitation.email,
    reviewer_name: reviewerName,
    status: "created",
    package_nonce_hash: hashToken(uploadToken),
    resume_secret_hash: hashToken(resumeToken),
    upload_expires_at: uploadExpiresAt,
    delivery_mode: record.integration ? "integration" : "download",
  }).select("id").single();
  if (error || !review) {
    if (!isShared) await admin.from("invitations").update({ status: invitation.status }).eq("id", invitation.id).eq("status", "started");
    return json({ error: "Could not start this review." }, 500, record.origin);
  }
  return json({ reviewId: review.id, uploadToken, uploadExpiresAt, resumeToken, maxArchiveBytes: 4 * 1024 * 1024, reviewerName, config: widgetConfig(record), resumed: false }, 201, record.origin);
}

async function refreshReview(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  reviewId: string,
  resumeToken: string,
  reviewerName: string | null,
  record: NonNullable<Awaited<ReturnType<typeof getWidgetProject>>>,
  origin: string,
  resumed: boolean,
) {
  const uploadToken = createOpaqueToken();
  const uploadExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: refreshed, error } = await admin.from("reviews").update({
    package_nonce_hash: hashToken(uploadToken),
    package_nonce_consumed_at: null,
    upload_expires_at: uploadExpiresAt,
    reviewer_name: reviewerName,
  }).eq("id", reviewId).eq("status", "created").select("id,draft_revision,draft_updated_at").maybeSingle();
  if (error || !refreshed) return json({ error: "Could not reconnect this review." }, 500, origin);
  return json({ reviewId, uploadToken, uploadExpiresAt, resumeToken, maxArchiveBytes: 4 * 1024 * 1024, reviewerName, config: widgetConfig(record), resumed, draftRevision: refreshed.draft_revision, draftUpdatedAt: refreshed.draft_updated_at }, 200, origin);
}

function cleanReviewerName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: cors(request.headers.get("origin") || "*") }); }
function json(body: unknown, status: number, origin: string) { return Response.json(body, { status, headers: cors(origin) }); }
function cors(origin: string) { return { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", Vary: "Origin", "Cache-Control": "no-store" }; }
