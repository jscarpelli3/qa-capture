import { del } from "@vercel/blob";
import { authorizeDraftReview, draftCors, draftJson, loadDraft, MAX_DRAFT_NOTES, validDraftId } from "@/lib/review-drafts";

export async function GET(request: Request, { params }: RouteContext<"/api/v1/reviews/[reviewId]/draft">) {
  const { reviewId } = await params;
  const authorized = await authorizeDraftReview(request, reviewId);
  if ("error" in authorized) return authorized.error;
  try {
    const draft = await loadDraft(authorized.admin, reviewId);
    return draftJson({
      reviewId,
      reviewerName: authorized.review.reviewer_name,
      revision: authorized.review.draft_revision,
      updatedAt: authorized.review.draft_updated_at,
      ...draft,
    }, 200, authorized.origin);
  } catch (error) {
    return draftJson({ error: error instanceof Error ? error.message : "Could not load the saved review draft." }, 500, authorized.origin);
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/v1/reviews/[reviewId]/draft">) {
  const { reviewId } = await params;
  const authorized = await authorizeDraftReview(request, reviewId);
  if ("error" in authorized) return authorized.error;
  if (Number(request.headers.get("content-length") || 0) > 150_000) return draftJson({ error: "The note is too large." }, 413, authorized.origin);

  let body: { note?: unknown; reviewerName?: unknown };
  try { body = await request.json(); } catch { return draftJson({ error: "Invalid note data." }, 400, authorized.origin); }
  const validated = validateNote(body.note);
  if ("error" in validated) return draftJson({ error: validated.error }, 422, authorized.origin);

  const { count, error: countError } = await authorized.admin.from("review_notes").select("id", { count: "exact", head: true }).eq("review_id", reviewId).neq("note_id", validated.note.id);
  if (countError) return draftJson({ error: "Could not inspect the saved review." }, 500, authorized.origin);
  if ((count || 0) >= MAX_DRAFT_NOTES) return draftJson({ error: `A QA pass holds at most ${MAX_DRAFT_NOTES} notes.` }, 422, authorized.origin);

  const assetIds = validated.note.assets;
  if (assetIds.length) {
    const { data: assets, error: assetError } = await authorized.admin.from("review_assets").select("asset_id").eq("review_id", reviewId).in("asset_id", assetIds);
    if (assetError || (assets || []).length !== assetIds.length) return draftJson({ error: "A screenshot has not finished saving yet." }, 409, authorized.origin);
  }

  const now = new Date().toISOString();
  const { error: noteError } = await authorized.admin.from("review_notes").upsert({
    review_id: reviewId,
    note_id: validated.note.id,
    sequence: validated.note.sequence,
    kind: validated.note.kind,
    note_text: validated.note.text,
    payload: validated.note,
    updated_at: now,
  }, { onConflict: "review_id,note_id" });
  if (noteError) return draftJson({ error: "Could not save this note." }, 500, authorized.origin);

  const reviewerName = cleanReviewerName(body.reviewerName) || authorized.review.reviewer_name;
  const revision = Number(authorized.review.draft_revision || 0) + 1;
  const { error: reviewError } = await authorized.admin.from("reviews").update({ reviewer_name: reviewerName, draft_revision: revision, draft_updated_at: now }).eq("id", reviewId).eq("status", "created");
  if (reviewError) return draftJson({ error: "The note was saved, but the draft status could not be updated." }, 500, authorized.origin);
  return draftJson({ saved: true, revision, updatedAt: now }, 200, authorized.origin);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/v1/reviews/[reviewId]/draft">) {
  const { reviewId } = await params;
  const authorized = await authorizeDraftReview(request, reviewId);
  if ("error" in authorized) return authorized.error;
  let body: { reviewerName?: unknown };
  try { body = await request.json(); } catch { return draftJson({ error: "Invalid reviewer data." }, 400, authorized.origin); }
  const reviewerName = cleanReviewerName(body.reviewerName);
  if (!reviewerName) return draftJson({ error: "Reviewer name is required." }, 422, authorized.origin);
  const now = new Date().toISOString();
  const { error } = await authorized.admin.from("reviews").update({ reviewer_name: reviewerName, draft_updated_at: now }).eq("id", reviewId).eq("status", "created");
  if (error) return draftJson({ error: "Could not save the reviewer name." }, 500, authorized.origin);
  return draftJson({ saved: true, reviewerName, updatedAt: now }, 200, authorized.origin);
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/v1/reviews/[reviewId]/draft">) {
  const { reviewId } = await params;
  const authorized = await authorizeDraftReview(request, reviewId);
  if ("error" in authorized) return authorized.error;
  const { data: assets, error: assetError } = await authorized.admin.from("review_assets").select("storage_path").eq("review_id", reviewId);
  if (assetError) return draftJson({ error: "Could not inspect this unsubmitted session." }, 500, authorized.origin);
  try {
    const paths = (assets || []).map((asset) => asset.storage_path);
    if (paths.length) await del(paths);
  } catch {
    return draftJson({ error: "Could not remove this session's saved screenshots." }, 502, authorized.origin);
  }
  const [{ error: noteDeleteError }, { error: assetDeleteError }] = await Promise.all([
    authorized.admin.from("review_notes").delete().eq("review_id", reviewId),
    authorized.admin.from("review_assets").delete().eq("review_id", reviewId),
  ]);
  if (noteDeleteError || assetDeleteError) return draftJson({ error: "Could not remove this unsubmitted session." }, 500, authorized.origin);
  const { error: reviewError } = await authorized.admin.from("reviews").update({ status: "rejected", rejection_code: "reviewer_discarded", resume_secret_hash: null }).eq("id", reviewId).eq("status", "created");
  if (reviewError) return draftJson({ error: "Could not close this unsubmitted session." }, 500, authorized.origin);
  return draftJson({ discarded: true }, 200, authorized.origin);
}

export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: draftCors(request.headers.get("origin") || "*") }); }

function validateNote(value: unknown): { note: Record<string, unknown> & { id: string; sequence: number; kind: string; text: string; assets: string[] } } | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "A note is required." };
  const note = value as Record<string, unknown>;
  if (typeof note.id !== "string" || !validDraftId(note.id, "note")) return { error: "The note ID is invalid." };
  if (!Number.isInteger(note.sequence) || Number(note.sequence) < 1 || Number(note.sequence) > 200) return { error: "The note sequence is invalid." };
  if (typeof note.kind !== "string" || !["note", "bug", "copy", "design", "question"].includes(note.kind)) return { error: "The note type is invalid." };
  if (typeof note.text !== "string" || !note.text.trim() || note.text.length > 10_000) return { error: "The note text is invalid." };
  if (!Array.isArray(note.assets) || note.assets.length > 5 || !note.assets.every((id) => typeof id === "string" && validDraftId(id, "asset"))) return { error: "The note assets are invalid." };
  return { note: note as Record<string, unknown> & { id: string; sequence: number; kind: string; text: string; assets: string[] } };
}

function cleanReviewerName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}
