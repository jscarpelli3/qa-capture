import { get } from "@vercel/blob";
import { createZip, readZip } from "@qa-capture/aggregate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: RouteContext<"/api/projects/[projectId]/reviews/[reviewId]/download">) {
  const { projectId, reviewId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (typeof auth?.claims?.sub !== "string") return Response.json({ error: "Sign in again to download this review." }, { status: 401 });

  const { data: review } = await supabase.from("reviews")
    .select("id,project_id,approved_path,reviewer_name,reviewer_email,created_at,approved_at")
    .eq("id", reviewId).eq("project_id", projectId).maybeSingle();
  if (!review) return Response.json({ error: "Review not found." }, { status: 404 });
  if (!review.approved_path) return Response.json({ error: "This review package is not available." }, { status: 404 });

  const stored = await get(review.approved_path, { access: "private", useCache: false });
  if (!stored) return Response.json({ error: "The retained review package is missing." }, { status: 404 });
  const original = Buffer.from(await new Response(stored.stream).arrayBuffer());
  const files = readZip(original);
  const sourceReview = JSON.parse(files.get("review.json")?.toString("utf8") || "{}");
  const admin = createSupabaseAdminClient();
  const { data: project } = await supabase.from("projects").select("id,name").eq("id", projectId).single();
  const { data: deliveries, error } = await admin.from("review_deliveries")
    .select("integration_id,note_id,status,external_id,external_label,error_code,attempted_at,delivered_at,integration:project_integrations(provider,external_project_id,external_project_name)")
    .eq("review_id", review.id).order("created_at", { ascending: true });
  if (error) return Response.json({ error: "Could not build this review’s delivery map." }, { status: 500 });

  const deliveryMap = {
    schema: "qawell-delivery-map/1",
    reviewId: review.id,
    sourceReviewId: typeof sourceReview?.header?.id === "string" ? sourceReview.header.id : null,
    qawellProject: { id: projectId, name: project?.name || null },
    generatedAt: new Date().toISOString(),
    usage: {
      purpose: "Correlate each captured QA note with the ticket created in the connected system.",
      join: "delivery-map.json deliveries[].noteId = review.json notes[].id",
      sourceOfTruth: "review.json contains the feedback and browser context; this file contains delivery state and external identifiers.",
    },
    reviewer: { name: review.reviewer_name, email: review.reviewer_email },
    deliveries: (deliveries || []).map((delivery) => {
      const integration = Array.isArray(delivery.integration) ? delivery.integration[0] : delivery.integration;
      return {
        noteId: delivery.note_id,
        provider: integration?.provider || "unknown",
        integrationId: delivery.integration_id,
        externalProject: { id: integration?.external_project_id || null, name: integration?.external_project_name || null },
        status: delivery.status,
        ticket: delivery.external_id ? { id: delivery.external_id, label: delivery.external_label || delivery.external_id, url: null } : null,
        errorCode: delivery.error_code,
        attemptedAt: delivery.attempted_at,
        deliveredAt: delivery.delivered_at,
      };
    }),
  };
  files.set("delivery-map.json", Buffer.from(JSON.stringify(deliveryMap, null, 2)));
  const archive = createZip(Array.from(files, ([name, data]) => ({ name, data })));
  const reviewer = filenamePart(review.reviewer_name || "reviewer");
  const date = new Date(review.approved_at || review.created_at).toISOString().slice(0, 10);
  return new Response(new Uint8Array(archive), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="qawell-${reviewer}-${date}.zip"`, "Cache-Control": "private, no-store" } });
}

function filenamePart(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "reviewer";
}
