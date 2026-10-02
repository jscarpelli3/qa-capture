"use client";

import { useActionState, useRef, useState } from "react";
import { createInvitation, type InvitationFormState } from "@/app/dashboard/actions";

export function InvitationForm({ projectId, stagingUrl }: { projectId: string; stagingUrl: string }) {
  const action = createInvitation.bind(null, projectId);
  const [state, formAction, pending] = useActionState<InvitationFormState, FormData>(action, {});
  const [copied, setCopied] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);

  async function copyInviteLink() {
    if (!state.inviteLink) return;
    try {
      await navigator.clipboard.writeText(state.inviteLink);
    } catch {
      linkInput.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return <form className="setupForm inviteForm" action={formAction}>
    <span className="stepNumber">NEW //</span><h2>Invite a reviewer</h2>
    {state.error ? <p className="formError">{state.error}</p> : null}
    {state.inviteLink ? <div className="inviteResult"><strong>{state.emailDelivery === "sent" ? "Invitation emailed" : "Invite link ready"}</strong><p>{state.emailDelivery === "sent" ? "Email sent. Copy the link as a backup; QAWELL stores only a hash of its secret." : state.emailDelivery === "failed" ? "The email could not be sent. Copy and send this link yourself; your invitation is still valid." : "Copy this private link and send it to the reviewer yourself."}</p><div className="inviteLinkRow"><input ref={linkInput} aria-label="Invitation link" readOnly value={state.inviteLink} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={copyInviteLink}>{copied ? "Copied!" : "Copy link"}</button></div><span className="copyStatus" aria-live="polite">{copied ? "Invitation link copied to clipboard." : ""}</span></div> : null}
    <label>Name<input name="name" maxLength={200} placeholder="Wayne Newton" /></label>
    <label>Email<input name="email" type="email" required maxLength={200} placeholder="wayne@example.com" /></label>
    <label>Page to review<input name="staging_url" type="url" required defaultValue={stagingUrl} /></label>
    <button className="button inviteSubmit" type="submit" disabled={pending} aria-busy={pending}>{pending ? <><span className="buttonSpinner" aria-hidden="true" />Creating link…</> : "Create invite link →"}</button>
  </form>;
}
