import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { InvitationForm } from "./invitation-form";
import { updateProjectIdentity, verifyProjectOrigin } from "@/app/dashboard/actions";
import { WidgetPreview } from "./widget-preview";
import { PendingButton } from "./pending-button";

export default async function ProjectPage({ params, searchParams }: PageProps<"/dashboard/projects/[projectId]">) {
  const { projectId } = await params;
  const query = await searchParams;
  const { supabase, project } = await requireProject(projectId);
  const { data: origins } = await supabase.from("project_origins").select("origin,verified_at").eq("project_id", projectId);
  const { data: organization } = await supabase.from("organizations").select("name").eq("id", project.organization_id).single();
  const { data: integrations } = await supabase.from("project_integrations").select("provider,status,external_project_name,last_verified_at").eq("project_id", projectId);
  const { data: invitations } = await supabase.from("invitations").select("id,email,reviewer_name,status,staging_url,accepted_reviews,expires_at,submitted_at,created_at").eq("project_id", projectId).order("created_at", { ascending: false });
  const { count: completedPasses } = await supabase.from("reviews").select("id", { count: "exact", head: true }).eq("project_id", projectId).in("status", ["approved", "delivering", "delivered", "delivery_failed"]);
  const agencyBrain = integrations?.find((item) => item.provider === "agency_brain");
  const snippet = `<script src="https://qawell.dev/capture.js" data-project="${project.public_key}"></script>`;
  const identityAction = updateProjectIdentity.bind(null, projectId);
  const verifyOriginAction = verifyProjectOrigin.bind(null, projectId);

  return (
    <main className="shell dashboardShell">
      <nav className="appNav"><Link href="/dashboard">← Projects</Link><Link href="/" className="wordmark">QAWELL</Link></nav>
      <header className="projectHeader"><p>{project.environment_label || "Staging"}{" //"}</p><h1>{project.name}</h1><div className="passCounter"><strong>{completedPasses || 0}</strong><span>QA passes<br />completed</span></div></header>
      {query.connected ? <p className="formSuccess">Agency Brain is connected.</p> : null}
      {query.updated ? <p className="formSuccess">Review identity updated.</p> : null}
      {query.error ? <p className="formError">{query.error}</p> : null}
      {!origins?.[0]?.verified_at ? <form className="originWarning" action={verifyOriginAction}><p><strong>Site verification required.</strong> Existing projects need one live URL check before hosted invitations and submissions can run.</p><span className="button"><PendingButton idle={`Verify ${origins?.[0]?.origin || "site"} →`} pending="Checking site…" /></span></form> : null}
      <section className="projectDetailGrid">
        <article className="setupCard installCard"><span className="stepNumber">01 //</span><h2>Install QAWELL</h2><p>Add this before the closing <code>&lt;/body&gt;</code> tag on the staging site.</p><pre><code>{snippet}</code></pre><dl><div><dt>Public project key</dt><dd>{project.public_key}</dd></div><div><dt>Allowed origin</dt><dd>{origins?.[0]?.origin || "Not restricted yet"}</dd></div><div><dt>Site status</dt><dd><span className={origins?.[0]?.verified_at ? "verifiedLabel" : "unverifiedLabel"}>{origins?.[0]?.verified_at ? "Verified" : "Not verified"}</span><form className="inlineVerify" action={verifyOriginAction}><PendingButton idle="Recheck site →" pending="Checking site…" /></form></dd></div></dl><form className="identityForm" action={identityAction}><h3>What reviewers see</h3><label>Company<input name="organization" required defaultValue={organization?.name || ""} /></label><label>Site / project<input name="project" required defaultValue={project.name} /></label><label>Environment<input name="environment" required defaultValue={project.environment_label || "Staging"} /></label><button className="textLink" type="submit">Save identity →</button></form><WidgetPreview organization={organization?.name || "QAWELL workspace"} project={project.name} environment={project.environment_label || "Staging"} provider={agencyBrain?.status === "active" ? agencyBrain.provider : null} destination={agencyBrain?.external_project_name} /></article>
        <article className="setupCard integrationCard"><span className="stepNumber">02 //</span><h2>Choose a destination</h2>{agencyBrain?.status === "active" ? <><p className="connectionFlag">CONNECTED</p><h3>Agency Brain</h3><p>New reviews will become QA tickets in <strong>{agencyBrain.external_project_name}</strong>.</p><Link className="textLink" href={`/dashboard/projects/${projectId}/integrations`}>Manage connection →</Link></> : <><p>Decide where completed reviews should go. The original QAWELL package remains available.</p><Link className="button" href={`/dashboard/projects/${projectId}/integrations`}>Choose integration →</Link></>}</article>
        <article className="setupCard inviteCard"><span className="stepNumber">03 //</span><h2>Invite reviewers</h2><div className="invitationArea"><InvitationForm projectId={projectId} stagingUrl={origins?.[0]?.origin || ""} /><div className="inviteList"><h3>Review activity</h3>{invitations?.length ? invitations.map((invite) => <div className="inviteRow" key={invite.id}><span className={`inviteStatus status-${invite.status}`}>{invite.status === "draft" ? "link ready" : invite.status === "sent" ? "emailed" : invite.status.replaceAll("_", " ")}</span><strong>{invite.reviewer_name || invite.email}</strong><small>{invite.reviewer_name ? invite.email : invite.staging_url}</small><b>{invite.accepted_reviews} submitted</b></div>) : <p>No one has been invited yet.</p>}</div></div></article>
      </section>
    </main>
  );
}
