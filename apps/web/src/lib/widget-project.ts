import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getWidgetProject(publicKey: string, requestOrigin: string) {
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin.from("projects").select("id,name,environment_label,organization_id,public_key").eq("public_key", publicKey).maybeSingle();
  if (!project) return null;
  const [{ data: origins }, { data: organization }, { data: integration }] = await Promise.all([
    admin.from("project_origins").select("origin,verified_at").eq("project_id", project.id),
    admin.from("organizations").select("name").eq("id", project.organization_id).single(),
    admin.from("project_integrations").select("id,provider,status,external_project_name").eq("project_id", project.id).eq("status", "active").maybeSingle(),
  ]);
  const normalizedOrigin = new URL(requestOrigin).origin;
  if (!origins?.some((item) => item.verified_at && item.origin === normalizedOrigin)) return null;
  return { project, organization, integration, origin: normalizedOrigin };
}

export function widgetConfig(record: NonNullable<Awaited<ReturnType<typeof getWidgetProject>>>) {
  return {
    organization: record.organization?.name || "QAWELL workspace",
    project: record.project.name,
    environment: record.project.environment_label || "Staging",
    delivery: record.integration ? {
      mode: "integration",
      provider: record.integration.provider === "agency_brain" ? "Agency Brain" : "Sifter",
      destination: record.integration.external_project_name,
    } : { mode: "download", provider: null, destination: null },
  };
}
