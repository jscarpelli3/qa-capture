import "server-only";
import { decryptCredential } from "@/lib/integration-credentials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { QawellReview, ReviewAsset, ReviewNote } from "@qa-capture/aggregate";

export class AgencyBrainDeliveryError extends Error {
  constructor(message: string, public code: string, public retryable: boolean, public retryAfterSeconds?: number) {
    super(message);
    this.name = "AgencyBrainDeliveryError";
  }
}

export async function deliverReviewToAgencyBrain(reviewId: string, review: QawellReview, assetsById: Map<string, ReviewAsset>, options: { noteId?: string; reconcile?: boolean } = {}) {
  const admin = createSupabaseAdminClient();
  const { data: storedReview } = await admin.from("reviews").select("project_id,reviewer_name,reviewer_email").eq("id", reviewId).single();
  if (!storedReview) throw new Error("Review record not found");
  const { data: integration } = await admin.from("project_integrations").select("id,external_project_id").eq("project_id", storedReview.project_id).eq("provider", "agency_brain").eq("status", "active").maybeSingle();
  if (!integration?.external_project_id) return { delivered: 0, mode: "download" as const };
  const { data: credential } = await admin.from("integration_credentials").select("encrypted_secret").eq("integration_id", integration.id).single();
  if (!credential) throw new Error("Agency Brain credential not found");
  const apiKey = decryptCredential(credential.encrypted_secret);
  const externalTickets = options.reconcile ? await fetchExistingTickets(apiKey, integration.external_project_id) : [];
  let delivered = 0;
  let attachmentsDelivered = 0;
  let attachmentsFailed = 0;

  const notes = options.noteId ? review.notes.filter((note) => note.id === options.noteId) : review.notes;
  if (options.noteId && notes.length !== 1) throw new AgencyBrainDeliveryError("The queued QA note is not present in the retained review.", "note_missing", false);
  for (const note of notes) {
    const noteAssets = (note.assets || []).map((id) => assetsById.get(id)).filter((asset): asset is ReviewAsset => Boolean(asset));
    const uploadableAssets = noteAssets.slice(0, 5);
    const overflowCount = Math.max(0, noteAssets.length - uploadableAssets.length);
    const { data: existing, error: existingError } = await admin.from("review_deliveries").select("id,status,external_id,external_label,attachment_count,attachments_delivered,attachments_failed").eq("review_id", reviewId).eq("integration_id", integration.id).eq("note_id", note.id).maybeSingle();
    if (existingError) throw new Error("Could not read the Agency Brain delivery record");
    if (existing?.status === "delivered" && existing.external_id && existing.attachment_count === noteAssets.length && !existing.attachments_failed) {
      delivered += 1;
      attachmentsDelivered += existing.attachments_delivered || 0;
      attachmentsFailed += existing.attachments_failed || 0;
      continue;
    }
    const deliveryId = existing?.id || crypto.randomUUID();
    const { error: deliveryStartError } = await admin.from("review_deliveries").upsert({ id: deliveryId, review_id: reviewId, integration_id: integration.id, note_id: note.id, status: "delivering", attempted_at: new Date().toISOString(), error_code: null, attachment_count: noteAssets.length, attachments_delivered: 0, attachments_failed: 0 });
    if (deliveryStartError) throw new Error("Could not initialize the Agency Brain delivery record");
    const reconciled = existing?.external_id ? { id:existing.external_id, ticket_number:undefined, label:existing.external_label } : findExistingTicket(externalTickets, review.header?.id, note.id);
    let ticketId: string;
    let ticketLabel: string;
    if (reconciled) {
      ticketId = reconciled.id;
      ticketLabel = reconciled.label || (reconciled.ticket_number ? `QA #${reconciled.ticket_number}` : reconciled.id);
    } else {
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
        throw providerResponseError(response, `Agency Brain rejected note ${note.id}`);
      }
      const ticket = await response.json();
      ticketId = ticket.id;
      ticketLabel = ticket.ticket_number ? `QA #${ticket.ticket_number}` : ticket.id;
    }

    await admin.from("review_deliveries").update({ external_id:ticketId, external_label:ticketLabel }).eq("id", deliveryId);
    const attachmentResult = await uploadAttachments(admin, deliveryId, apiKey, ticketId, uploadableAssets);
    const failedCount = attachmentResult.failed + overflowCount;
    const deliveryStatus = failedCount ? "failed" : "delivered";
    const { error: deliveryFinishError } = await admin.from("review_deliveries").update({ status: deliveryStatus, external_id: ticketId, external_label: ticketLabel, delivered_at: failedCount ? null : new Date().toISOString(), attachments_delivered: attachmentResult.delivered, attachments_failed: failedCount, error_code: failedCount ? attachmentResult.firstError || "agency_brain_attachment_limit" : null }).eq("id", deliveryId);
    if (deliveryFinishError) throw new Error("Could not save the Agency Brain delivery result");
    if (failedCount) throw new AgencyBrainDeliveryError("One or more Agency Brain screenshots were not accepted.", attachmentResult.firstError || "agency_brain_attachment_limit", attachmentResult.retryable && !overflowCount, attachmentResult.retryAfterSeconds);
    delivered += 1;
    attachmentsDelivered += attachmentResult.delivered;
    attachmentsFailed += failedCount;
  }
  return { delivered, attachmentsDelivered, attachmentsFailed, mode: "integration" as const };
}

async function uploadAttachments(admin: ReturnType<typeof createSupabaseAdminClient>, deliveryId: string, apiKey: string, ticketId: string, assets: ReviewAsset[]) {
  let delivered = 0;
  let failed = 0;
  let firstError: string | null = null;
  let retryable = true;
  let retryAfterSeconds: number | undefined;
  for (const asset of assets) {
    const { data: existing } = await admin.from("review_delivery_attachments").select("status,attempts").eq("delivery_id", deliveryId).eq("asset_id", asset.id).maybeSingle();
    if (existing?.status === "delivered") { delivered += 1; continue; }
    await admin.from("review_delivery_attachments").upsert({ delivery_id:deliveryId, asset_id:asset.id, status:"delivering", attempts:(existing?.attempts || 0) + 1, attempted_at:new Date().toISOString(), updated_at:new Date().toISOString(), error_code:null }, { onConflict:"delivery_id,asset_id" });
    try {
      const form = new FormData();
      const fileName = asset.path.split("/").pop() || `${asset.id}.${extensionForMime(asset.mime)}`;
      form.append("file", new Blob([new Uint8Array(asset.data)], { type: asset.mime }), fileName);
      const response = await fetch(`https://theagencybrain.com/api/external/qa/tickets/${encodeURIComponent(ticketId)}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 201) {
        const result = await response.json().catch(() => ({}));
        await admin.from("review_delivery_attachments").update({ status:"delivered", external_id:result?.attachment?.id || null, delivered_at:new Date().toISOString(), updated_at:new Date().toISOString(), error_code:null }).eq("delivery_id", deliveryId).eq("asset_id", asset.id);
        delivered += 1;
      }
      else {
        failed += 1;
        firstError ||= `agency_brain_attachment_${response.status}`;
        const responseRetryable = response.status === 429 || response.status >= 500;
        retryable &&= responseRetryable;
        retryAfterSeconds ||= parseRetryAfter(response.headers.get("retry-after"));
        await admin.from("review_delivery_attachments").update({ status:"failed", error_code:`agency_brain_attachment_${response.status}`, updated_at:new Date().toISOString() }).eq("delivery_id", deliveryId).eq("asset_id", asset.id);
      }
    } catch {
      failed += 1;
      firstError ||= "agency_brain_attachment_network";
      await admin.from("review_delivery_attachments").update({ status:"failed", error_code:"agency_brain_attachment_network", updated_at:new Date().toISOString() }).eq("delivery_id", deliveryId).eq("asset_id", asset.id);
    }
  }
  return { delivered, failed, firstError, retryable, retryAfterSeconds };
}

function extensionForMime(mime: ReviewAsset["mime"]) {
  return mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
}

type ExternalTicket = { id: string; ticket_number?: number; description?: string | null; label?: string | null };

async function fetchExistingTickets(apiKey: string, projectId: string): Promise<ExternalTicket[]> {
  const url = new URL("https://theagencybrain.com/api/external/qa/tickets");
  url.searchParams.set("project_id", projectId);
  url.searchParams.set("limit", "500");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw providerResponseError(response, "Agency Brain ticket reconciliation failed");
  const result = await response.json();
  return Array.isArray(result?.tickets) ? result.tickets : [];
}

function providerResponseError(response: Response, message: string) {
  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
  const retryable = response.status === 429 || response.status >= 500;
  return new AgencyBrainDeliveryError(`${message} with ${response.status}`, `agency_brain_${response.status}`, retryable, retryAfter);
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

function findExistingTicket(tickets: ExternalTicket[], reviewId?: string, noteId?: string) {
  if (!reviewId || !noteId) return null;
  const currentReference = `Review: ${reviewId}\nNote: ${noteId}`;
  const legacyReference = `QAWELL ref: ${reviewId}:${noteId}`;
  return tickets.find((ticket) => typeof ticket.description === "string" && (ticket.description.includes(currentReference) || ticket.description.includes(legacyReference))) || null;
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
