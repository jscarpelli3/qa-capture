import Link from "next/link";
import { selectAgencyBrainProject } from "@/app/dashboard/actions";
import { fetchAgencyBrainProjects } from "@/lib/agency-brain";
import { requireProject } from "@/lib/auth";
import { decryptCredential } from "@/lib/integration-credentials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AgencyBrainProjectPage({ params, searchParams }: PageProps<"/dashboard/projects/[projectId]/integrations/agency-brain/project">) {
  const { projectId } = await params;
  const query = await searchParams;
  const { project } = await requireProject(projectId);
  const admin = createSupabaseAdminClient();
  const { data: integration } = await admin.from("project_integrations").select("id").eq("project_id", projectId).eq("provider", "agency_brain").maybeSingle();
  const { data: credential } = integration ? await admin.from("integration_credentials").select("encrypted_secret").eq("integration_id", integration.id).maybeSingle() : { data: null };
  if (!credential) return <main className="shell dashboardShell"><p>Connection not found. <Link href={`/dashboard/projects/${projectId}/integrations/agency-brain`}>Start again.</Link></p></main>;
  let projects: Awaited<ReturnType<typeof fetchAgencyBrainProjects>> = [];
  let loadError = "";
  try { projects = await fetchAgencyBrainProjects(decryptCredential(credential.encrypted_secret)); } catch (error) { loadError = error instanceof Error ? error.message : "Could not load projects."; }
  const action = selectAgencyBrainProject.bind(null, projectId);
  return <main className="shell dashboardShell"><nav className="appNav"><Link href={`/dashboard/projects/${projectId}/integrations/agency-brain`}>← API key</Link><span className="wordmark">QAWELL</span></nav><section className="connectionLayout"><div className="connectionCopy"><span className="giantNumber">02</span><h1>Choose the<br />QA project</h1><p>Notes captured for <strong>{project.name}</strong> will become tickets in the Agency Brain project you select here.</p></div><form className="setupForm projectPicker" action={action}><p className="formKicker">AGENCY BRAIN // PROJECT</p>{query.error || loadError ? <p className="formError">{query.error || loadError}</p> : null}<div className="radioList">{projects.map((item) => <label key={item.id}><input type="radio" name="external_project_id" value={item.id} required /><span><strong>{item.name}</strong><small>{item.open_tickets ?? 0} open QA tickets</small></span></label>)}</div><button className="button" type="submit" disabled={!projects.length}>Connect this project →</button></form></section></main>;
}
