import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteInvitation } from "@/lib/invitation-cleanup";

export async function DELETE(request: Request, { params }: RouteContext<"/api/projects/[projectId]/invitations/[invitationId]">) {
  const { projectId, invitationId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (typeof auth?.claims?.sub !== "string") return Response.json({ error: "Sign in again to delete this invitation." }, { status: 401 });

  const ids = z.object({ projectId: z.uuid(), invitationId: z.uuid() }).safeParse({ projectId, invitationId });
  if (!ids.success) return Response.json({ error: "Invalid invitation." }, { status: 400 });
  const { data: invitation } = await supabase.from("invitations").select("id,project_id").eq("id", invitationId).eq("project_id", projectId).maybeSingle();
  if (!invitation) return Response.json({ error: "Invitation not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const deleteReviews = body?.deleteReviews === true;
  try {
    const result = await deleteInvitation(invitation.id, deleteReviews);
    return Response.json({ deleted: true, deletedReviews: result.deletedReviews });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete the invitation." }, { status: 500 });
  }
}
