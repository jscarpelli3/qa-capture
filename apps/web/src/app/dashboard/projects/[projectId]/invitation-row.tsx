"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type InvitationRowProps = {
  projectId: string;
  submissions: number;
  invitation: { id: string; email: string; reviewer_name: string | null; status: string; staging_url: string; accepted_reviews: number };
};

export function InvitationRow({ projectId, invitation, submissions }: InvitationRowProps) {
  const router = useRouter();
  const [deleteReviews, setDeleteReviews] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const status = ["draft", "sent"].includes(invitation.status) ? "link ready" : invitation.status.replaceAll("_", " ");

  async function removeInvitation() {
    const detail = deleteReviews
      ? "Delete this invitation and all of its QAWELL QA records? Tickets already sent to integrations will not be deleted."
      : "Delete this invitation? Its existing QAWELL QA records will be preserved.";
    if (!window.confirm(detail)) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations/${invitation.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteReviews }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete the invitation.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete the invitation.");
      setPending(false);
    }
  }

  async function generateLink() {
    if (!window.confirm("Generate a new link for this reviewer? Their previous invitation link will stop working.")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations/${invitation.id}`, { method: "PATCH" });
      const result = await response.json();
      if (!response.ok || !result.inviteLink) throw new Error(result.error || "Could not generate a new invitation link.");
      setInviteLink(result.inviteLink);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not generate a new invitation link.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return <div className="inviteRow">
    <span className={`inviteStatus status-${invitation.status}`}>{status}</span>
    <strong>{invitation.reviewer_name || invitation.email}</strong>
    <small>{invitation.reviewer_name ? invitation.email : invitation.staging_url}</small>
    <b>{submissions} submitted</b>
    {inviteLink ? <div className="reviewerLink"><code>{inviteLink}</code><button type="button" onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button><small>Copy it now. For security, QAWELL cannot display this secret again after the page refreshes.</small></div> : null}
    <div className="inviteDelete">
      <button type="button" onClick={generateLink} disabled={pending}>Generate new link</button>
      <label><input type="checkbox" checked={deleteReviews} onChange={(event) => setDeleteReviews(event.target.checked)} /> Also delete QA records</label>
      <button type="button" onClick={removeInvitation} disabled={pending}>{pending ? "Deleting…" : "Delete invite"}</button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  </div>;
}
