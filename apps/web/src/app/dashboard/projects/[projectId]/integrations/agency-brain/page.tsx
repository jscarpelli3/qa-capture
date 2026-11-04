import Link from "next/link";
import { connectAgencyBrain } from "@/app/dashboard/actions";
import { requireProject } from "@/lib/auth";
import { PendingButton } from "../../pending-button";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AgencyBrainPage({ params, searchParams }: PageProps<"/dashboard/projects/[projectId]/integrations/agency-brain">) {
  const { projectId } = await params;
  const query = await searchParams;
  const { project } = await requireProject(projectId);
  const admin = createSupabaseAdminClient();
  const { data: integration } = await admin.from("project_integrations").select("id,status,external_project_name,last_verified_at").eq("project_id", projectId).eq("provider", "agency_brain").maybeSingle();
  const { data: credential } = integration ? await admin.from("integration_credentials").select("integration_id").eq("integration_id", integration.id).maybeSingle() : { data: null };
  const action = connectAgencyBrain.bind(null, projectId);
  const saved = Boolean(credential);
  return <main className="shell dashboardShell"><nav className="appNav"><Link href={`/dashboard/projects/${projectId}/integrations`}>← Integrations</Link><span className="wordmark">QAWELL</span></nav><section className="connectionLayout"><div className="connectionCopy"><span className="giantNumber">01</span><h1>Connect<br />Agency Brain</h1><p>In Agency Brain, create an API key under <strong>Settings → API Keys</strong>. Give it <code>qa:read</code> so QAWELL can list projects and reconcile retries, plus <code>qa:create</code> so approved notes can become tickets.</p><div className="connectionLimitCopy"><strong>Current limit</strong><p>Delivery is sequential and Agency Brain permits 30 ticket creations per API key each minute. Keep individual review passes under 30 notes for the cleanest handoff.</p></div></div><div className="setupForm credentialForm"><p className="formKicker">{project.name}{" // CREDENTIAL"}</p>{query.error ? <p className="formError">{query.error}</p> : null}{saved ? <section className="savedConnection"><span>{integration?.status === "active" ? "CONNECTED" : "SETUP SAVED"}</span><h2>{integration?.status === "active" ? `Sending QA to ${integration.external_project_name}` : "Your verified API key is saved."}</h2><p>You can refresh, close this page, or come back later without entering the key again.</p><Link className="button" href={`/dashboard/projects/${projectId}/integrations/agency-brain/project`}>{integration?.status === "active" ? "Choose a different project →" : "Continue to project selection →"}</Link></section> : null}<details className="replaceCredential" open={!saved}><summary>{saved ? "Replace the Agency Brain API key" : "Enter an Agency Brain API key"}</summary><form action={action}><label>Agency Brain API key<input name="api_key" type="password" required autoComplete="off" placeholder="ab_••••••••••••••••" /></label><p className="securityNote">Encrypted before storage. Never included in QAWELL’s browser code or capture packages.</p><PendingButton className="button" idle={saved ? "Verify replacement key →" : "Verify key & continue →"} pending="Verifying key…" /></form></details></div></section></main>;
}
