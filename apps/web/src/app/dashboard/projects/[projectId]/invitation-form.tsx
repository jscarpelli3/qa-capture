"use client";

import { useActionState } from "react";
import { createInvitation, type InvitationFormState } from "@/app/dashboard/actions";

export function InvitationForm({ projectId, stagingUrl }: { projectId: string; stagingUrl: string }) {
  const action = createInvitation.bind(null, projectId);
  const [state, formAction, pending] = useActionState<InvitationFormState, FormData>(action, {});
  return <form className="setupForm inviteForm" action={formAction}>
    <span className="stepNumber">NEW //</span><h2>Invite a reviewer</h2>
    {state.error ? <p className="formError">{state.error}</p> : null}
    {state.inviteLink ? <div className="inviteResult"><strong>Invitation created</strong><p>Copy this link now. QAWELL stores only a hash of its secret.</p><input readOnly value={state.inviteLink} onFocus={(event) => event.currentTarget.select()} /></div> : null}
    <label>Name<input name="name" maxLength={200} placeholder="Jane Reviewer" /></label>
    <label>Email<input name="email" type="email" required maxLength={200} placeholder="jane@example.com" /></label>
    <label>Page to review<input name="staging_url" type="url" required defaultValue={stagingUrl} /></label>
    <button className="button" type="submit" disabled={pending}>{pending ? "Creating…" : "Create invite link →"}</button>
  </form>;
}
