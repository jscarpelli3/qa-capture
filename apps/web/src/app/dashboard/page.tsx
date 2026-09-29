import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  return (
    <main className="shell"><header className="dashboardHeader">
      <h1>Projects<span className="period">.</span></h1>
      <p className="dashboardMeta">SESSION // {String(data.claims.email || "verified user")}</p>
    </header><section className="emptyState"><div className="emptyCode">000</div><h2>No projects yet.</h2><p>The next infrastructure slice will create projects, allowed origins, and installation keys.</p></section></main>
  );
}
