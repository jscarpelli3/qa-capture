import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOpaqueToken, hashToken } from "@/lib/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";

async function authorizedInvitation(projectId: string, invitationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (typeof auth?.claims?.sub !== "string") return { error: Response.json({ error: "Sign in again to manage this reviewer." }, { status: 401 }) };
  const ids = z.object({ projectId: z.uuid(), invitationId: z.uuid() }).safeParse({ projectId, invitationId });
  if (!ids.success) return { error: Response.json({ error: "Invalid invitation." }, { status: 400 }) };
  const { data: invitation } = await supabase.from("invitations").select("id,project_id,staging_url,link_type").eq("id", invitationId).eq("project_id", projectId).maybeSingle();
  if (!invitation) return { error: Response.json({ error: "Invitation not found." }, { status: 404 }) };
  return { invitation };
}

export async function PATCH(_request: Request, { params }: RouteContext<"/api/projects/[projectId]/invitations/[invitationId]">) {
  const { projectId, invitationId } = await params;
  const authorized = await authorizedInvitation(projectId, invitationId);
  if ("error" in authorized) return authorized.error;
  const secret = createOpaqueToken();
  const admin = createSupabaseAdminClient();
  const shared = authorized.invitation.link_type === "shared";
  if (!shared) await admin.from("reviews").update({ status: "rejected", rejection_code: "invitation_rotated" }).eq("invitation_id", authorized.invitation.id).eq("status", "created");
  const { error } = await admin.from("invitations").update({ secret_hash: hashToken(secret), status: "draft", accepted_reviews: 0, submitted_at: null, expires_at: shared ? null : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() }).eq("id", authorized.invitation.id);
  if (error) return Response.json({ error: "Could not generate a new invitation link." }, { status: 500 });
  return Response.json({ inviteLink: new URL(`/invite/${secret}`, getServerEnv().NEXT_PUBLIC_APP_URL).toString() });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/projects/[projectId]/invitations/[invitationId]">) {
  const { projectId, invitationId } = await params;
  const authorized = await authorizedInvitation(projectId, invitationId);
  if ("error" in authorized) return authorized.error;

  const admin = createSupabaseAdminClient();
  await admin.from("reviews").update({ status: "rejected", rejection_code: "review_link_disabled" }).eq("invitation_id", authorized.invitation.id).eq("status", "created");
  const { error } = await admin.from("invitations").update({ status: "revoked" }).eq("id", authorized.invitation.id);
  if (error) return Response.json({ error: "Could not disable the review link." }, { status: 500 });
  return Response.json({ disabled: true });
}
