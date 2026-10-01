import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;
  if (error || typeof userId !== "string") redirect("/login");
  return { supabase, userId, email: String(claims?.email || "verified user") };
}

export async function requireProject(projectId: string) {
  const auth = await requireUser();
  const { data: project } = await auth.supabase
    .from("projects")
    .select("id,name,public_key,environment_label,organization_id,created_at")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) redirect("/dashboard");
  return { ...auth, project };
}
