import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOpaqueToken, hashToken } from "@/lib/tokens";

const invitationSchema = z.object({
  email: z.email().max(200),
  name: z.string().trim().max(200).optional(),
  stagingUrl: z.url(),
});

export async function POST(request: Request, { params }: RouteContext<"/api/projects/[projectId]/invitations">) {
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (typeof userId !== "string") return Response.json({ error: "Sign in again to create an invitation." }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const parsed = invitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the reviewer email and staging URL." }, { status: 400 });

  const { data: origins } = await supabase.from("project_origins").select("origin").eq("project_id", project.id);
  const inviteUrl = new URL(parsed.data.stagingUrl);
  if (!origins?.some(({ origin }) => origin === inviteUrl.origin)) {
    return Response.json({ error: "The invitation URL must use this project’s verified staging origin." }, { status: 400 });
  }

  const secret = createOpaqueToken();
  const { error } = await supabase.from("invitations").insert({
    project_id: project.id,
    email: parsed.data.email.toLowerCase(),
    reviewer_name: parsed.data.name || null,
    secret_hash: hashToken(secret),
    staging_url: inviteUrl.toString(),
    status: "draft",
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    max_reviews: 1,
    created_by: userId,
  });
  if (error) return Response.json({ error: "The invitation could not be created." }, { status: 500 });

  return Response.json({ inviteLink: `${inviteUrl.toString().split("#")[0]}#qa-invite=${secret}` }, { status: 201 });
}
