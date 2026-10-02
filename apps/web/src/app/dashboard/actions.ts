"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProject, requireUser } from "@/lib/auth";
import { fetchAgencyBrainProjects } from "@/lib/agency-brain";
import { decryptCredential, encryptCredential } from "@/lib/integration-credentials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateReachableSiteUrl } from "@/lib/site-url";
import { createOpaqueToken, hashToken } from "@/lib/tokens";

const projectSchema = z.object({
  organization: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  environment: z.string().trim().max(80).optional(),
  origin: z.url(),
});

export async function createProject(formData: FormData) {
  const { supabase } = await requireUser();
  const parsed = projectSchema.safeParse({
    organization: formData.get("organization"),
    name: formData.get("name"),
    environment: formData.get("environment"),
    origin: formData.get("origin"),
  });
  if (!parsed.success) redirect("/dashboard?error=Check+the+project+details+and+try+again");

  const { data: organizationId, error: organizationError } = await supabase.rpc("bootstrap_organization", {
    organization_name: parsed.data.organization,
  });
  if (organizationError || !organizationId) redirect("/dashboard?error=Could+not+create+your+workspace");

  let verifiedSite: Awaited<ReturnType<typeof validateReachableSiteUrl>>;
  try { verifiedSite = await validateReachableSiteUrl(parsed.data.origin); }
  catch (error) {
    const message = error instanceof Error ? error.message : "That site URL could not be verified.";
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }

  const { data: project, error } = await supabase.from("projects").insert({
    organization_id: organizationId,
    name: parsed.data.name,
    environment_label: parsed.data.environment || "Staging",
    public_key: `qawell_pk_${randomBytes(18).toString("base64url")}`,
  }).select("id").single();
  if (error || !project) redirect("/dashboard?error=Could+not+create+the+project");

  await supabase.from("project_origins").insert({ project_id: project.id, origin: verifiedSite.origin, verified_at: new Date().toISOString() });
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

export type InvitationFormState = { error?: string; inviteLink?: string };

export async function createInvitation(projectId: string, _state: InvitationFormState, formData: FormData): Promise<InvitationFormState> {
  const { supabase, userId, project } = await requireProject(projectId);
  const parsed = z.object({
    email: z.email().max(200),
    name: z.string().trim().max(200).optional(),
    stagingUrl: z.url(),
  }).safeParse({ email: formData.get("email"), name: formData.get("name"), stagingUrl: formData.get("staging_url") });
  if (!parsed.success) return { error: "Check the reviewer email and staging URL." };

  const { data: origins } = await supabase.from("project_origins").select("origin").eq("project_id", project.id);
  const inviteUrl = new URL(parsed.data.stagingUrl);
  if (!origins?.some(({ origin }) => origin === inviteUrl.origin)) return { error: "The invitation URL must use this project’s verified staging origin." };

  const secret = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("invitations").insert({
    project_id: project.id,
    email: parsed.data.email.toLowerCase(),
    reviewer_name: parsed.data.name || null,
    secret_hash: hashToken(secret),
    staging_url: inviteUrl.toString(),
    status: "draft",
    expires_at: expiresAt,
    max_reviews: 1,
    created_by: userId,
  });
  if (error) return { error: "The invitation could not be created." };
  const inviteLink = `${inviteUrl.toString().split("#")[0]}#qa-invite=${secret}`;
  return { inviteLink };
}

export async function updateProjectIdentity(projectId: string, formData: FormData) {
  const { supabase, project } = await requireProject(projectId);
  const parsed = z.object({ organization: z.string().trim().min(1).max(160), project: z.string().trim().min(1).max(160), environment: z.string().trim().min(1).max(80) }).safeParse({ organization: formData.get("organization"), project: formData.get("project"), environment: formData.get("environment") });
  if (!parsed.success) redirect(`/dashboard/projects/${projectId}?error=Check+the+review+identity+fields`);
  const [{ error: organizationError }, { error: projectError }] = await Promise.all([
    supabase.from("organizations").update({ name: parsed.data.organization }).eq("id", project.organization_id),
    supabase.from("projects").update({ name: parsed.data.project, environment_label: parsed.data.environment }).eq("id", project.id),
  ]);
  if (organizationError || projectError) redirect(`/dashboard/projects/${projectId}?error=Could+not+update+the+review+identity`);
  redirect(`/dashboard/projects/${projectId}?updated=identity`);
}

export async function verifyProjectOrigin(projectId: string) {
  const { supabase, project } = await requireProject(projectId);
  const { data: originRecord } = await supabase.from("project_origins").select("id,origin").eq("project_id", project.id).maybeSingle();
  if (!originRecord) redirect(`/dashboard/projects/${projectId}?error=This+project+does+not+have+a+site+URL`);
  try { await validateReachableSiteUrl(originRecord.origin); }
  catch (error) {
    const message = error instanceof Error ? error.message : "That site URL could not be verified.";
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent(message)}`);
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("project_origins").update({ verified_at: new Date().toISOString() }).eq("id", originRecord.id).eq("project_id", project.id);
  if (error) redirect(`/dashboard/projects/${projectId}?error=The+site+responded+but+QAWELL+could+not+save+verification`);
  redirect(`/dashboard/projects/${projectId}?updated=origin`);
}
