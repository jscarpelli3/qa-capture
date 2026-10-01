"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProject, requireUser } from "@/lib/auth";
import { fetchAgencyBrainProjects } from "@/lib/agency-brain";
import { decryptCredential, encryptCredential } from "@/lib/integration-credentials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const projectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  environment: z.string().trim().max(80).optional(),
  origin: z.url().optional().or(z.literal("")),
});

export async function createProject(formData: FormData) {
  const { supabase, email } = await requireUser();
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    environment: formData.get("environment"),
    origin: formData.get("origin"),
  });
  if (!parsed.success) redirect("/dashboard?error=Check+the+project+details+and+try+again");

  const organizationName = `${email.split("@")[0] || "My"}'s workspace`;
  const { data: organizationId, error: organizationError } = await supabase.rpc("bootstrap_organization", {
    organization_name: organizationName,
  });
  if (organizationError || !organizationId) redirect("/dashboard?error=Could+not+create+your+workspace");

  const { data: project, error } = await supabase.from("projects").insert({
    organization_id: organizationId,
    name: parsed.data.name,
    environment_label: parsed.data.environment || "Staging",
    public_key: `qawell_pk_${randomBytes(18).toString("base64url")}`,
  }).select("id").single();
  if (error || !project) redirect("/dashboard?error=Could+not+create+the+project");

  if (parsed.data.origin) {
    const origin = new URL(parsed.data.origin).origin;
    await supabase.from("project_origins").insert({ project_id: project.id, origin });
  }
  redirect(`/dashboard/projects/${project.id}`);
}

const agencyBrainKeySchema = z.string().trim().min(8).max(500).startsWith("ab_");

export async function connectAgencyBrain(projectId: string, formData: FormData) {
  await requireProject(projectId);
  const parsed = agencyBrainKeySchema.safeParse(formData.get("api_key"));
  if (!parsed.success) redirect(`/dashboard/projects/${projectId}/integrations/agency-brain?error=Enter+a+valid+Agency+Brain+key`);

  try {
    await fetchAgencyBrainProjects(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify this key.";
    redirect(`/dashboard/projects/${projectId}/integrations/agency-brain?error=${encodeURIComponent(message)}`);
  }

  const admin = createSupabaseAdminClient();
  const { data: integration, error: integrationError } = await admin.from("project_integrations").upsert({
    project_id: projectId,
    provider: "agency_brain",
    status: "pending",
    external_project_id: null,
    external_project_name: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id,provider" }).select("id").single();
  if (integrationError || !integration) redirect(`/dashboard/projects/${projectId}/integrations/agency-brain?error=Could+not+save+the+connection`);

  const { error: credentialError } = await admin.from("integration_credentials").upsert({
    integration_id: integration.id,
    encrypted_secret: encryptCredential(parsed.data),
    updated_at: new Date().toISOString(),
  });
  if (credentialError) redirect(`/dashboard/projects/${projectId}/integrations/agency-brain?error=Could+not+securely+store+the+key`);
  redirect(`/dashboard/projects/${projectId}/integrations/agency-brain/project`);
}

export async function selectAgencyBrainProject(projectId: string, formData: FormData) {
  await requireProject(projectId);
  const externalProjectId = z.string().uuid().safeParse(formData.get("external_project_id"));
  if (!externalProjectId.success) redirect(`/dashboard/projects/${projectId}/integrations/agency-brain/project?error=Choose+a+project`);

  const admin = createSupabaseAdminClient();
  const { data: integration } = await admin.from("project_integrations")
    .select("id")
    .eq("project_id", projectId)
    .eq("provider", "agency_brain")
    .maybeSingle();
  if (!integration) redirect(`/dashboard/projects/${projectId}/integrations/agency-brain`);

  const { data: credential } = await admin.from("integration_credentials")
    .select("encrypted_secret")
    .eq("integration_id", integration.id)
    .maybeSingle();
  if (!credential) redirect(`/dashboard/projects/${projectId}/integrations/agency-brain`);

  let projects;
  try {
    projects = await fetchAgencyBrainProjects(decryptCredential(credential.encrypted_secret));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Agency Brain projects.";
    redirect(`/dashboard/projects/${projectId}/integrations/agency-brain/project?error=${encodeURIComponent(message)}`);
  }
  const externalProject = projects.find((project) => project.id === externalProjectId.data);
  if (!externalProject) redirect(`/dashboard/projects/${projectId}/integrations/agency-brain/project?error=That+project+is+not+available`);

  await admin.from("project_integrations").update({
    external_project_id: externalProject.id,
    external_project_name: externalProject.name,
    status: "active",
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", integration.id);
  redirect(`/dashboard/projects/${projectId}?connected=agency-brain`);
}
