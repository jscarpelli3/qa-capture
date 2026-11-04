import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";
import { invitationTarget, projectAllowsOrigin, type ProjectSiteMode } from "@/lib/project-site";

export async function GET(_request: Request, { params }: RouteContext<"/invite/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) return unavailable();

  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin.from("invitations")
    .select("project_id,status,expires_at,max_reviews,accepted_reviews,staging_url,link_type")
    .eq("secret_hash", hashToken(token))
    .maybeSingle();
  const unavailableIndividual = Boolean(invitation && invitation.link_type !== "shared" && (!invitation.expires_at || invitation.max_reviews == null || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.accepted_reviews >= invitation.max_reviews));
  if (!invitation || unavailableIndividual || ["revoked", "expired", "exhausted"].includes(invitation.status)) return unavailable();

  const [{ data: project }, { data: origins }] = await Promise.all([
    admin.from("projects").select("site_mode,current_site_url,shopify_store_id").eq("id", invitation.project_id).maybeSingle(),
    admin.from("project_origins").select("origin,verified_at").eq("project_id", invitation.project_id),
  ]);
  const configuredOrigin = (origins || []).find((item) => item.verified_at)?.origin;
  if (!project?.current_site_url || !configuredOrigin) return unavailable();

  let target: URL;
  try { target = invitationTarget(project.current_site_url, invitation.staging_url); }
  catch { return unavailable(); }
  if (!projectAllowsOrigin(project.site_mode as ProjectSiteMode, configuredOrigin, project.shopify_store_id, target.origin)) return unavailable();
  target.hash = `qa-invite=${encodeURIComponent(token)}`;

  return new Response(null, { status: 307, headers: { Location: target.toString(), "Cache-Control": "no-store, private" } });
}

function unavailable() {
  return new Response("This QAWELL review link is unavailable. Ask the project owner for a new link.", {
    status: 410,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}
