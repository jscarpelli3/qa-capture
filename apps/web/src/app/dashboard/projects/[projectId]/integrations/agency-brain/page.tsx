import Link from "next/link";
import { connectAgencyBrain } from "@/app/dashboard/actions";
import { requireProject } from "@/lib/auth";

export default async function AgencyBrainPage({ params, searchParams }: PageProps<"/dashboard/projects/[projectId]/integrations/agency-brain">) {
  const { projectId } = await params;
  const query = await searchParams;
  const { project } = await requireProject(projectId);
  const action = connectAgencyBrain.bind(null, projectId);
  return <main className="shell dashboardShell"><nav className="appNav"><Link href={`/dashboard/projects/${projectId}/integrations`}>← Integrations</Link><span className="wordmark">QAWELL</span></nav><section className="connectionLayout"><div className="connectionCopy"><span className="giantNumber">01</span><h1>Connect<br />Agency Brain</h1><p>In Agency Brain, create an API key under <strong>Settings → API Keys</strong>. Give it <code>qa:read</code> and <code>qa:create</code>. QAWELL uses read access only to show your eligible projects during setup.</p></div><form className="setupForm credentialForm" action={action}><p className="formKicker">{project.name}{" // CREDENTIAL"}</p>{query.error ? <p className="formError">{query.error}</p> : null}<label>Agency Brain API key<input name="api_key" type="password" required autoComplete="off" placeholder="ab_••••••••••••••••" /></label><p className="securityNote">Encrypted before storage. Never included in QAWELL’s browser code or capture packages.</p><button className="button" type="submit">Verify key & continue →</button></form></section></main>;
}
