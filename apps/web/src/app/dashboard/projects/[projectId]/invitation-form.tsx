"use client";

import { FormEvent, useRef, useState } from "react";

export function InvitationForm({ projectId, stagingUrl }: { projectId: string; stagingUrl: string }) {
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      linkInput.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setInviteLink("");
    setCopied(false);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), stagingUrl: form.get("staging_url") }),
      });
      const result = await response.json();
      if (!response.ok || !result.inviteLink) throw new Error(result.error || "The invitation could not be created.");
      setInviteLink(result.inviteLink);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The invitation could not be created.");
    } finally {
      setPending(false);
    }
  }

  return <form className="setupForm inviteForm" onSubmit={createInvite}>
    <span className="stepNumber">NEW //</span><h2>Invite a reviewer</h2>
    {error ? <p className="formError">{error}</p> : null}
    {inviteLink ? <div className="inviteResult"><strong>Invite link ready</strong><p>Copy this private link and paste it into your own email to the reviewer.</p><div className="inviteLinkPrint" aria-label="Invitation link">{inviteLink}</div><div className="inviteLinkActions"><button type="button" onClick={copyInviteLink}>{copied ? "Copied!" : "Copy link"}</button><button type="button" disabled title="Email integration not set up">Send invite — email integration not set up</button></div><input ref={linkInput} className="visuallyHidden" aria-hidden="true" tabIndex={-1} readOnly value={inviteLink} /><span className="copyStatus" aria-live="polite">{copied ? "Invitation link copied to clipboard." : ""}</span></div> : null}
    <label>Name<input name="name" maxLength={200} placeholder="Bob Sacamano" /></label>
    <label>Email<input name="email" type="email" required maxLength={200} placeholder="bob@example.com" /></label>
    <label>Page to review<input name="staging_url" type="url" required defaultValue={stagingUrl} /></label>
    <button className="button inviteSubmit" type="submit" disabled={pending} aria-busy={pending}>{pending ? <><span className="buttonSpinner" aria-hidden="true" />Creating link…</> : "Create invite link →"}</button>
  </form>;
}
