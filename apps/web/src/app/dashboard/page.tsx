import Link from "next/link";
import { createProject } from "@/app/dashboard/actions";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { supabase, email } = await requireUser();
  const query = await searchParams;
  const { data: memberships } = await supabase.from("organization_members").select("organization_id");
  const organizationIds = (memberships || []).map((membership) => membership.organization_id);
  const { data: projects } = organizationIds.length
    ? await supabase.from("projects").select("id,name,environment_label,public_key,created_at").in("organization_id", organizationIds).order("created_at", { ascending: false })
    : { data: [] };
  const projectIds = (projects || []).map((project) => project.id);
  const { data: completedReviews } = projectIds.length ? await supabase.from("reviews").select("project_id").in("project_id", projectIds).in("status", ["approved", "delivering", "delivered", "delivery_failed"]) : { data: [] };
  const passCounts = new Map<string, number>();
  for (const review of completedReviews || []) passCounts.set(review.project_id, (passCounts.get(review.project_id) || 0) + 1);

  return (
    <main className="shell dashboardShell">
      <nav className="appNav"><Link href="/" className="wordmark">QAWELL</Link><span>{email}</span></nav>
      <header className="dashboardHeader"><h1>Projects<span className="period">.</span></h1><p className="dashboardMeta">{projects?.length || 0} ACTIVE SETUPS</p></header>
      {query.error ? <p className="formError">{query.error}</p> : null}
      <section className="projectWorkspace">
        <div className="projectList">
          {projects?.length ? projects.map((project, index) => <Link className="projectRow" href={`/dashboard/projects/${project.id}`} key={project.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{project.name}</strong><small>{passCounts.get(project.id) || 0} passes · {project.environment_label || "Staging"} →</small></Link>) : <div className="emptyProject"><strong>No projects yet.</strong><p>Create one here. You’ll get an installation key and can connect its QA destination next.</p></div>}
        </div>
        <form className="setupForm createProjectForm" action={createProject}>
          <span className="stepNumber">NEW //</span><h2>Set up a site</h2>
          <label>Company / workspace<input name="organization" required maxLength={160} placeholder="Your company" /></label>
          <label>Project name<input name="name" required maxLength={160} placeholder="Client website" /></label>
          <label>Environment<input name="environment" maxLength={80} defaultValue="Staging" /></label>
          <label>Allowed site URL<input name="origin" type="url" required placeholder="https://staging.example.com" /></label>
          <button className="button" type="submit">Create project →</button>
        </form>
      </section>
    </main>
  );
}
