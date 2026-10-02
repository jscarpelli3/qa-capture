import "server-only";
import { Resend } from "resend";

export type InvitationEmail = {
  to: string;
  reviewerName?: string | null;
  projectName: string;
  inviteLink: string;
  expiresAt: string;
};

export type InvitationEmailResult =
  | { status: "manual" }
  | { status: "sent"; messageId: string };

/**
 * Manual is the safe default. Setting all three server-only variables opts the
 * application into delivery without changing invitation creation again.
 */
export async function deliverInvitationEmail(invitation: InvitationEmail): Promise<InvitationEmailResult> {
  if (process.env.QAWELL_EMAIL_DELIVERY !== "resend") return { status: "manual" };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QAWELL_INVITE_FROM;
  if (!apiKey || !from) throw new Error("Resend delivery is enabled but its server credentials are incomplete.");

  const resend = new Resend(apiKey);
  const greeting = invitation.reviewerName ? `Hi ${invitation.reviewerName},` : "Hello,";
  const expires = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(invitation.expiresAt));
  const { data, error } = await resend.emails.send({
    from,
    to: invitation.to,
    subject: `QA review requested: ${invitation.projectName}`,
    text: `${greeting}\n\nYou have been invited to review ${invitation.projectName} with QAWELL.\n\nOpen review: ${invitation.inviteLink}\n\nThis personal link expires ${expires}. Do not forward it.`,
    html: `<p>${escapeHtml(greeting)}</p><p>You have been invited to review <strong>${escapeHtml(invitation.projectName)}</strong> with QAWELL.</p><p><a href="${escapeHtml(invitation.inviteLink)}">Open the review</a></p><p>This personal link expires ${escapeHtml(expires)}. Do not forward it.</p>`,
  }, { idempotencyKey: `qawell-invitation/${hashForIdempotency(invitation.inviteLink)}` });

  if (error || !data?.id) throw new Error(error?.message || "Resend did not accept the invitation email.");
  return { status: "sent", messageId: data.id };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function hashForIdempotency(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}
