import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOpaqueToken, hashToken } from "@/lib/tokens";
import { getServerEnv } from "@/lib/env";
import { projectAllowsOrigin, type ProjectSiteMode } from "@/lib/project-site";

const invitationSchema = z.object({
  stagingUrl: z.url(),
});

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[projectId]/invitations">) {
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (typeof userId !== "string") return Response.json({ error: "Sign in again to create an invitation." }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id,site_mode,shopify_store_id").eq("id", projectId).maybeSingle();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const parsed = invitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the review page URL." }, { status: 400 });

  const { data: existingLink } = await supabase.from("invitations").select("id").eq("project_id", project.id).eq("link_type", "shared").maybeSingle();
  if (existingLink) return Response.json({ error: "This project already has a reusable QA link. Rotate that link if you need a new one." }, { status: 409 });

  const { data: origins } = await supabase.from("project_origins").select("origin").eq("project_id", project.id);
  const inviteUrl = new URL(parsed.data.stagingUrl);
  const configuredOrigin = origins?.[0]?.origin;
  if (!configuredOrigin || !projectAllowsOrigin(project.site_mode as ProjectSiteMode, configuredOrigin, project.shopify_store_id, inviteUrl.origin)) {
    return Response.json({ error: "The invitation URL must use this project’s verified staging origin." }, { status: 400 });
  }

  const secret = createOpaqueToken();
  const { error } = await supabase.from("invitations").insert({
    project_id: project.id,
    email: null,
    reviewer_name: null,
    secret_hash: hashToken(secret),
    staging_url: inviteUrl.toString(),
    status: "draft",
    expires_at: null,
    max_reviews: null,
    link_type: "shared",
    created_by: userId,
  });
  if (error) return Response.json({ error: "The reusable QA link could not be created." }, { status: 500 });

  return Response.json({ inviteLink: new URL(`/invite/${secret}`, getServerEnv().NEXT_PUBLIC_APP_URL).toString() }, { status: 201 });
}
