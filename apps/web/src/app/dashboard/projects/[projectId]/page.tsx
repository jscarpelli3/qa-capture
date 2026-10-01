import Link from "next/link";
import { requireProject } from "@/lib/auth";

export default async function ProjectPage({ params, searchParams }: PageProps<"/dashboard/projects/[projectId]">) {
  const { projectId } = await params;
  const query = await searchParams;
  const { supabase, project } = await requireProject(projectId);
  const { data: origins } = await supabase.from("project_origins").select("origin").eq("project_id", projectId);
  const { data: integrations } = await supabase.from("project_integrations").select("provider,status,external_project_name,last_verified_at").eq("project_id", projectId);
  const agencyBrain = integrations?.find((item) => item.provider === "agency_brain");
  const snippet = `<script src="https://qawell.dev/capture.js" data-project="${project.public_key}"></script>`;

  return (
    <main className="shell dashboardShell">
      <nav className="appNav"><Link href="/dashboard">← Projects</Link><Link href="/" className="wordmark">QAWELL</Link></nav>
      <header className="projectHeader"><p>{project.environment_label || "Staging"}{" //"}</p><h1>{project.name}</h1></header>
      {query.connected ? <p className="formSuccess">Agency Brain is connected.</p> : null}
      <section className="projectDetailGrid">
        <article className="setupCard installCard"><span className="stepNumber">01 //</span><h2>Install QAWELL</h2><p>Add this before the closing <code>&lt;/body&gt;</code> tag on the staging site.</p><pre><code>{snippet}</code></pre><dl><div><dt>Public project key</dt><dd>{project.public_key}</dd></div><div><dt>Allowed origin</dt><dd>{origins?.[0]?.origin || "Not restricted yet"}</dd></div></dl></article>
        <article className="setupCard integrationCard"><span className="stepNumber">02 //</span><h2>Choose a destination</h2>{agencyBrain?.status === "active" ? <><p className="connectionFlag">CONNECTED</p><h3>Agency Brain</h3><p>New reviews will become QA tickets in <strong>{agencyBrain.external_project_name}</strong>.</p><Link className="textLink" href={`/dashboard/projects/${projectId}/integrations`}>Manage connection →</Link></> : <><p>Decide where completed reviews should go. The original QAWELL package remains available.</p><Link className="button" href={`/dashboard/projects/${projectId}/integrations`}>Choose integration →</Link></>}</article>
        <article className="setupCard inviteCard"><span className="stepNumber">03 //</span><h2>Invite reviewers</h2><p>Reviewer invitations come next. First we’re making sure projects and destinations are wired correctly.</p><button className="button buttonDisabled" disabled>Coming next</button></article>
      </section>
    </main>
  );
}
