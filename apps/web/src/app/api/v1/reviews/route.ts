import { createOpaqueToken, hashToken } from "@/lib/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWidgetProject, widgetConfig } from "@/lib/widget-project";

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin") || "";
  let body: { projectKey?: string; invitationToken?: string; origin?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400, requestOrigin); }
  if (!body.projectKey || !body.invitationToken || !body.origin) return json({ error: "Project, origin, and invitation are required." }, 400, requestOrigin);

  const record = await getWidgetProject(body.projectKey, body.origin).catch(() => null);
  if (!record || requestOrigin !== record.origin) return json({ error: "Project origin is not authorized." }, 403, requestOrigin);
  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin.from("invitations").select("id,email,reviewer_name,status,expires_at,max_reviews,accepted_reviews,staging_url").eq("project_id", record.project.id).eq("secret_hash", hashToken(body.invitationToken)).maybeSingle();
  if (!invitation || new Date(invitation.expires_at) <= new Date() || invitation.accepted_reviews >= invitation.max_reviews || ["revoked", "expired", "exhausted"].includes(invitation.status)) {
    return json({ error: "This invitation is invalid or has expired." }, 403, record.origin);
  }
  if (new URL(invitation.staging_url).origin !== record.origin) return json({ error: "Invitation origin mismatch." }, 403, record.origin);

  const nonce = createOpaqueToken();
  const { data: review, error } = await admin.from("reviews").insert({
    project_id: record.project.id,
    invitation_id: invitation.id,
    reviewer_email: invitation.email,
    reviewer_name: invitation.reviewer_name,
    status: "created",
    package_nonce_hash: hashToken(nonce),
    upload_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    delivery_mode: record.integration ? "integration" : "download",
  }).select("id").single();
  if (error || !review) return json({ error: "Could not start this review." }, 500, record.origin);
  await admin.from("invitations").update({ status: "started" }).eq("id", invitation.id);
  return json({ reviewId: review.id, uploadToken: nonce, maxArchiveBytes: 4 * 1024 * 1024, reviewerName: invitation.reviewer_name, config: widgetConfig(record) }, 201, record.origin);
}

export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: cors(request.headers.get("origin") || "*") }); }
function json(body: unknown, status: number, origin: string) { return Response.json(body, { status, headers: cors(origin) }); }
function cors(origin: string) { return { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", Vary: "Origin", "Cache-Control": "no-store" }; }
