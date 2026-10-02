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
    {state.inviteLink ? <div className="inviteResult"><strong>Invite link ready</strong><p>Copy this private link and paste it into your own email to the reviewer.</p><div className="inviteLinkPrint" aria-label="Invitation link">{state.inviteLink}</div><div className="inviteLinkActions"><button type="button" onClick={copyInviteLink}>{copied ? "Copied!" : "Copy link"}</button><button type="button" disabled title="Email integration not set up">Send invite — email integration not set up</button></div><input ref={linkInput} className="visuallyHidden" aria-hidden="true" tabIndex={-1} readOnly value={state.inviteLink} /><span className="copyStatus" aria-live="polite">{copied ? "Invitation link copied to clipboard." : ""}</span></div> : null}
    <label>Name<input name="name" maxLength={200} placeholder="Bob Sacamano" /></label>
    <label>Email<input name="email" type="email" required maxLength={200} placeholder="bob@example.com" /></label>
    <label>Page to review<input name="staging_url" type="url" required defaultValue={stagingUrl} /></label>
    <button className="button inviteSubmit" type="submit" disabled={pending} aria-busy={pending}>{pending ? <><span className="buttonSpinner" aria-hidden="true" />Creating link…</> : "Create invite link →"}</button>
  </form>;
}
