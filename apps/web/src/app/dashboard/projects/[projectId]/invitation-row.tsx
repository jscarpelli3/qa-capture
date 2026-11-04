"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ReviewLinkRowProps = {
  projectId: string;
  submissions: number;
  invitation: { id: string; status: string; staging_url: string };
};

export function InvitationRow({ projectId, invitation, submissions }: ReviewLinkRowProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"link" | "disable" | null>(null);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const disabled = invitation.status === "revoked";

  async function disableLink() {
    if (!window.confirm("Disable this QA link? It will stop opening new reviews. Completed QA records will be preserved.")) return;
    setPendingAction("disable");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations/${invitation.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not disable the QA link.");
      setInviteLink("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not disable the QA link.");
    } finally {
      setPendingAction(null);
    }
  }

  async function rotateLink() {
    const action = disabled ? "Create a new active link?" : "Rotate this QA link? The previous link will stop working immediately.";
    if (!window.confirm(action)) return;
    setPendingAction("link");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations/${invitation.id}`, { method: "PATCH" });
      const result = await response.json();
      if (!response.ok || !result.inviteLink) throw new Error(result.error || "Could not generate the QA link.");
      setInviteLink(result.inviteLink);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not generate the QA link.");
    } finally {
      setPendingAction(null);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return <div className="inviteRow">
    <span className={`inviteStatus status-${invitation.status}`}>{disabled ? "disabled" : "active"}</span>
    <strong>Reusable project QA link</strong>
    <small>Starts on {invitation.staging_url}</small>
    <b>{submissions} completed QA {submissions === 1 ? "pass" : "passes"}</b>
    {inviteLink ? <div className="reviewerLink"><code>{inviteLink}</code><button type="button" onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button><small>Copy it now. QAWELL stores only its secure fingerprint and cannot display the secret again after refresh.</small></div> : null}
    <div className="inviteDelete">
      <button type="button" onClick={rotateLink} disabled={pendingAction !== null} aria-busy={pendingAction === "link"}>{pendingAction === "link" ? "Generating link…" : disabled ? "Create new active link" : "Rotate link"}</button>
      {!disabled ? <button type="button" onClick={disableLink} disabled={pendingAction !== null} aria-busy={pendingAction === "disable"}>{pendingAction === "disable" ? "Disabling…" : "Disable link"}</button> : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  </div>;
}
