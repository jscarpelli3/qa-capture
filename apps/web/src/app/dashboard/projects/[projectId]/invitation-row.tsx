"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type InvitationRowProps = {
  projectId: string;
  invitation: { id: string; email: string; reviewer_name: string | null; status: string; staging_url: string; accepted_reviews: number };
};

export function InvitationRow({ projectId, invitation }: InvitationRowProps) {
  const router = useRouter();
  const [deleteReviews, setDeleteReviews] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
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

  return <div className="inviteRow">
    <span className={`inviteStatus status-${invitation.status}`}>{status}</span>
    <strong>{invitation.reviewer_name || invitation.email}</strong>
    <small>{invitation.reviewer_name ? invitation.email : invitation.staging_url}</small>
    <b>{invitation.accepted_reviews} submitted</b>
    <div className="inviteDelete">
      <label><input type="checkbox" checked={deleteReviews} onChange={(event) => setDeleteReviews(event.target.checked)} /> Also delete QA records</label>
      <button type="button" onClick={removeInvitation} disabled={pending}>{pending ? "Deleting…" : "Delete invite"}</button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  </div>;
}
