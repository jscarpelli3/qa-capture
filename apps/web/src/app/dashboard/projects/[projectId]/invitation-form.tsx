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
        body: JSON.stringify({ stagingUrl: form.get("staging_url") }),
      });
      const result = await response.json();
      if (!response.ok || !result.inviteLink) throw new Error(result.error || "The reusable QA link could not be created.");
      setInviteLink(result.inviteLink);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The reusable QA link could not be created.");
    } finally {
      setPending(false);
    }
  }

  return <form className="setupForm inviteForm" onSubmit={createInvite}>
    <span className="stepNumber">SHARED //</span><h2>Create the QA link</h2>
    {error ? <p className="formError">{error}</p> : null}
    <p>Anyone with this link can run a QA pass. Each reviewer enters their own name, and completed notes go to this project’s connected destination.</p>
    {inviteLink ? <div className="inviteResult"><strong>Reusable QA link ready</strong><p>Copy this link now. It follows the project’s current site URL and can be used for future QA passes.</p><div className="inviteLinkPrint" aria-label="Reusable QA link">{inviteLink}</div><div className="inviteLinkActions"><button type="button" onClick={copyInviteLink}>{copied ? "Copied!" : "Copy link"}</button></div><input ref={linkInput} className="visuallyHidden" aria-hidden="true" tabIndex={-1} readOnly value={inviteLink} /><span className="copyStatus" aria-live="polite">{copied ? "QA link copied to clipboard." : ""}</span></div> : null}
    <label>Review starts on<input name="staging_url" type="url" required defaultValue={stagingUrl} /></label>
    <button className="button inviteSubmit" type="submit" disabled={pending} aria-busy={pending}>{pending ? <><span className="buttonSpinner" aria-hidden="true" />Creating link…</> : "Create reusable QA link →"}</button>
  </form>;
}
