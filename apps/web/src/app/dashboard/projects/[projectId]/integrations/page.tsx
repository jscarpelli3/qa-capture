import Link from "next/link";
import { requireProject } from "@/lib/auth";

export default async function IntegrationsPage({ params }: PageProps<"/dashboard/projects/[projectId]/integrations">) {
  const { projectId } = await params;
  const { project } = await requireProject(projectId);
  return <main className="shell dashboardShell"><nav className="appNav"><Link href={`/dashboard/projects/${projectId}`}>← {project.name}</Link><span className="wordmark">QAWELL</span></nav><header className="interiorHeader"><h1>Where should<br />the QA go?</h1><p>Connect one destination to this project. Credentials stay server-side and encrypted.</p></header><section className="integrationChoices"><Link className="integrationChoice available" href={`/dashboard/projects/${projectId}/integrations/agency-brain`}><span>AVAILABLE //</span><h2>Agency Brain</h2><p>Create one external QA ticket for each QAWELL note.</p><strong>Connect →</strong></Link><article className="integrationChoice unavailable"><span>NEXT //</span><h2>Sifter</h2><p>Send review notes into a selected Sifter project.</p><strong>Not wired yet</strong></article></section></main>;
}
