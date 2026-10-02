import "server-only";
import { decryptCredential } from "@/lib/integration-credentials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { QawellReview, ReviewNote } from "@qa-capture/aggregate";

export async function deliverReviewToAgencyBrain(reviewId: string, review: QawellReview) {
  const admin = createSupabaseAdminClient();
  const { data: storedReview } = await admin.from("reviews").select("project_id,reviewer_name,reviewer_email").eq("id", reviewId).single();
  if (!storedReview) throw new Error("Review record not found");
  const { data: integration } = await admin.from("project_integrations").select("id,external_project_id").eq("project_id", storedReview.project_id).eq("provider", "agency_brain").eq("status", "active").maybeSingle();
  if (!integration?.external_project_id) return { delivered: 0, mode: "download" as const };
  const { data: credential } = await admin.from("integration_credentials").select("encrypted_secret").eq("integration_id", integration.id).single();
  if (!credential) throw new Error("Agency Brain credential not found");
  const apiKey = decryptCredential(credential.encrypted_secret);
  let delivered = 0;

  for (const note of review.notes) {
    const { data: existing } = await admin.from("review_deliveries").select("id,status").eq("review_id", reviewId).eq("integration_id", integration.id).eq("note_id", note.id).maybeSingle();
    if (existing?.status === "delivered") { delivered += 1; continue; }
    const deliveryId = existing?.id || crypto.randomUUID();
    await admin.from("review_deliveries").upsert({ id: deliveryId, review_id: reviewId, integration_id: integration.id, note_id: note.id, status: "delivering", attempted_at: new Date().toISOString(), error_code: null });
    const response = await fetch("https://theagencybrain.com/api/external/qa/tickets", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        project_id: integration.external_project_id,
        title: ticketTitle(note),
        description: ticketDescription(note, review.header?.id),
        severity: note.kind === "bug" ? "high" : "medium",
        submitter_name: storedReview.reviewer_name || review.header?.reviewer?.name || undefined,
        submitter_email: storedReview.reviewer_email || undefined,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await admin.from("review_deliveries").update({ status: "failed", error_code: `agency_brain_${response.status}` }).eq("id", deliveryId);
      throw new Error(`Agency Brain rejected note ${note.id} with ${response.status}`);
    }
    const ticket = await response.json();
    await admin.from("review_deliveries").update({ status: "delivered", external_id: ticket.id, external_label: ticket.ticket_number ? `QA #${ticket.ticket_number}` : ticket.id, delivered_at: new Date().toISOString() }).eq("id", deliveryId);
    delivered += 1;
  }
  return { delivered, mode: "integration" as const };
}

function ticketTitle(note: ReviewNote) {
  const prefix = note.kind && note.kind !== "note" ? `[${String(note.kind).toUpperCase()}] ` : "";
  return `${prefix}${String(note.text || "QA note").replace(/\s+/g, " ").trim()}`.slice(0, 500);
}

function ticketDescription(note: ReviewNote, reviewId?: string) {
  const anchor = safeHttpUrl(note.target?.anchor?.url);
  const styles = note.target?.styles || {};
  const lines = [
    "QAWELL QA NOTE",
    "",
    "FEEDBACK",
    String(note.text || ""),
    "",
    "LOCATION",
    `Page: ${safeHttpUrl(note.page?.url) || note.page?.path || "Unknown"}`,
    anchor ? `Closest link (${note.target?.anchor?.precision || "page"}): ${anchor}` : "",
    `Viewport: ${note.viewport?.width || "?"} × ${note.viewport?.height || "?"}`,
    "",
    "SELECTED ELEMENT",
    `Selector: ${note.target?.selector || "Unknown"}`,
    note.target?.xpath ? `XPath: ${note.target.xpath}` : "",
    note.target?.tag ? `Tag: ${note.target.tag}` : "",
  ].filter(Boolean);
  if (note.target?.text) lines.push(`Text: ${String(note.target.text).slice(0, 500)}`);
  const styleSummary = ["display", "position", "font-family", "font-size", "font-weight", "line-height", "color", "background-color", "margin", "padding", "width", "height"]
    .filter((name) => styles[name]).map((name) => `${name}: ${styles[name]}`);
  if (styleSummary.length) lines.push("", "RELEVANT COMPUTED STYLES", ...styleSummary);
  const consoleCount = note.diagnostics?.consoleErrors?.length || 0;
  const requestCount = note.diagnostics?.failedRequests?.length || 0;
  if (consoleCount || requestCount) lines.push("", "DIAGNOSTICS", `${consoleCount} console errors · ${requestCount} failed requests`);
  if (reviewId && note.id) lines.push("", "REFERENCE", `Review: ${reviewId}`, `Note: ${note.id}`);
  return lines.join("\n").slice(0, 10_000);
}

function safeHttpUrl(value: unknown) {
  try { const url = new URL(String(value)); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; }
  catch { return null; }
}
