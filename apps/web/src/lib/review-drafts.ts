import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { projectAllowsRequestOrigin } from "@/lib/widget-project";
import { tokenMatches } from "@/lib/tokens";

export const MAX_DRAFT_NOTES = 25;
export const MAX_DRAFT_ASSET_BYTES = 2 * 1024 * 1024;

export async function authorizeDraftReview(request: Request, reviewId: string) {
  const origin = request.headers.get("origin") || "";
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return { error: draftJson({ error: "A review resume credential is required.", code: "RESUME_REQUIRED" }, 401, origin) };

  const admin = createSupabaseAdminClient();
  const { data: review, error } = await admin.from("reviews")
    .select("id,project_id,invitation_id,reviewer_name,status,resume_secret_hash,draft_revision,draft_updated_at")
    .eq("id", reviewId)
    .maybeSingle();
  if (error || !review?.resume_secret_hash || !tokenMatches(token, review.resume_secret_hash)) {
    return { error: draftJson({ error: "This review could not be resumed.", code: "RESUME_INVALID" }, 403, origin) };
  }
  if (review.status !== "created") {
    return { error: draftJson({ error: "This review is no longer editable.", code: "REVIEW_FINALIZED", status: review.status }, 409, origin) };
  }
  if (!await projectAllowsRequestOrigin(review.project_id, origin)) {
    return { error: draftJson({ error: "This site origin is not authorized for the review.", code: "ORIGIN_MISMATCH" }, 403, origin) };
  }
  return { admin, review, origin };
}

export async function loadDraft(admin: ReturnType<typeof createSupabaseAdminClient>, reviewId: string) {
  const [{ data: notes, error: notesError }, { data: assets, error: assetsError }] = await Promise.all([
    admin.from("review_notes").select("note_id,payload,updated_at").eq("review_id", reviewId).order("sequence", { ascending: true }),
    admin.from("review_assets").select("asset_id,file_name,mime_type,file_size,sha256,updated_at").eq("review_id", reviewId).order("created_at", { ascending: true }),
  ]);
  if (notesError || assetsError) throw new Error("Could not load the saved review draft");
  return {
    notes: (notes || []).map((row) => row.payload),
    assets: assets || [],
  };
}

export function validDraftId(value: string, prefix: "note" | "asset") {
  return new RegExp(`^${prefix}_[A-Za-z0-9-]{8,100}$`).test(value);
}

export function draftCors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-QAWELL-File-Name",
    "Access-Control-Expose-Headers": "ETag",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

export function draftJson(body: unknown, status: number, origin: string) {
  return Response.json(body, { status, headers: draftCors(origin) });
}
