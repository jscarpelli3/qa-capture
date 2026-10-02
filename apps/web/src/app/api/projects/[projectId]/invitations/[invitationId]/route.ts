import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteInvitation } from "@/lib/invitation-cleanup";
import { createOpaqueToken, hashToken } from "@/lib/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function authorizedInvitation(projectId: string, invitationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (typeof auth?.claims?.sub !== "string") return { error: Response.json({ error: "Sign in again to manage this reviewer." }, { status: 401 }) };
  const ids = z.object({ projectId: z.uuid(), invitationId: z.uuid() }).safeParse({ projectId, invitationId });
  if (!ids.success) return { error: Response.json({ error: "Invalid invitation." }, { status: 400 }) };
  const { data: invitation } = await supabase.from("invitations").select("id,project_id,staging_url").eq("id", invitationId).eq("project_id", projectId).maybeSingle();
  if (!invitation) return { error: Response.json({ error: "Invitation not found." }, { status: 404 }) };
  return { invitation };
}

export async function PATCH(_request: Request, { params }: RouteContext<"/api/projects/[projectId]/invitations/[invitationId]">) {
  const { projectId, invitationId } = await params;
  const authorized = await authorizedInvitation(projectId, invitationId);
  if ("error" in authorized) return authorized.error;
  const secret = createOpaqueToken();
  const admin = createSupabaseAdminClient();
  await admin.from("reviews").update({ status: "rejected", rejection_code: "invitation_rotated" }).eq("invitation_id", authorized.invitation.id).eq("status", "created");
  const { error } = await admin.from("invitations").update({ secret_hash: hashToken(secret), status: "draft", accepted_reviews: 0, submitted_at: null, expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() }).eq("id", authorized.invitation.id);
  if (error) return Response.json({ error: "Could not generate a new invitation link." }, { status: 500 });
  const inviteUrl = new URL(authorized.invitation.staging_url);
  return Response.json({ inviteLink: `${inviteUrl.toString().split("#")[0]}#qa-invite=${secret}` });
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/projects/[projectId]/invitations/[invitationId]">) {
  const { projectId, invitationId } = await params;
  const authorized = await authorizedInvitation(projectId, invitationId);
  if ("error" in authorized) return authorized.error;

  const body = await request.json().catch(() => ({}));
  const deleteReviews = body?.deleteReviews === true;
  try {
    const result = await deleteInvitation(authorized.invitation.id, deleteReviews);
    return Response.json({ deleted: true, deletedReviews: result.deletedReviews });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete the invitation." }, { status: 500 });
  }
}
