# QAWELL Launch Readiness Audit

Date: 2026-10-02  
Status: Direct concurrency audit complete; independent agent reviews attempted but unavailable due account usage limits

## Immediate objective

Use QAWELL with Agency Brain for real QA work on sites managed by the QAWELL team. This is an internal/trusted-team objective, not yet an unrestricted public launch.

## Readiness summary

| Launch level | Estimated readiness |
| --- | ---: |
| Internal projects and trusted teams | Ready, pending concurrent-reviewer validation |
| Invite-only design-partner beta | 85% |
| Public self-service beta | 65% |
| Broad production product | 50% |

The core end-to-end path has been proven in production:

```text
invited reviewer
  -> staging widget
  -> structured review ZIP
  -> private ingestion and validation
  -> Agency Brain ticket creation
  -> retained package with note-to-ticket delivery map
```

## Implemented capabilities

- Google developer authentication
- Project creation and origin verification
- Installation snippet and hosted widget
- Reviewer and invitation management
- Bearer invitation links
- Cross-page review persistence
- Element selection and structured DOM/browser context
- Optional reviewer-supplied, re-encoded screenshots
- Private ZIP ingestion and validation
- Private approved-package retention
- Authenticated enriched ZIP downloads
- Stable note-to-external-ticket mappings
- Encrypted integration credentials
- Agency Brain project selection and ticket delivery
- Submission confirmation, progress, recovery, and error states
- Invitation, review-record, delivery-record, and Blob cleanup

## Immediate internal-use gate

The primary untested risk is concurrent use:

- Multiple reviewers invited to the same project
- Multiple active invitation sessions at the same time
- Concurrent archive submissions
- Correct isolation of reviewer identity, notes, nonces, reviews, and delivery mappings
- No duplicate or crossed Agency Brain tickets
- Accurate reviewer and completed-pass counters
- Safe behavior when one reviewer refreshes, navigates, retries, or replaces a local session

Until this is exercised, QAWELL should be considered suitable for single-reviewer internal use and cautiously suitable for coordinated multi-reviewer use.

## Direct concurrency audit

### Hardening implemented after this audit

- Invitation start now atomically changes an eligible invitation to `started` before issuing a review nonce. Concurrent attempts using the same link receive `409` instead of creating another review.
- The widget disables its start control while review creation is pending.
- Rotating or deleting an invitation rejects its outstanding `created` reviews so unused upload credentials stop working.
- Widget storage keys are namespaced by project key, with a one-time migration path for matching legacy sessions.
- Agency Brain delivery now reconciles the embedded QAWELL review/note reference against existing project tickets before creating a ticket, substantially reducing duplicate creation after an external-success/local-write failure.

These changes materially reduce the first, fourth, and fifth risks below. The test matrix remains required; historical analysis is retained to explain the threat being addressed.

### What is already isolated correctly

- Every started review receives a unique database UUID and one-hour upload nonce.
- Every quarantine and approved Blob path includes the unique review ID.
- Upload nonce consumption uses a conditional database update, so the same review cannot be uploaded twice concurrently.
- Delivery uniqueness is enforced for `(review_id, integration_id, note_id)`.
- Distinct reviewer invitations create distinct review and delivery records.
- Dashboard reads are scoped through project membership policies.

These properties make two different reviewers with two different invitations unlikely to cross notes, packages, or ticket mappings.

### Blocker: one invitation can start multiple reviews

Review creation checks `accepted_reviews` and then inserts a review in separate operations. It does not atomically reserve the invitation. Two browsers opening the same invitation can both create valid review rows before either submits. Once created, both upload nonces remain usable even if the first submission exhausts the invitation.

Internal rule until fixed: create one unique invitation per reviewer, never share invitation links, and do not reuse the same link across devices.

Required fix: atomically claim or reserve an invitation in the database when creating a review, with a deliberate resume policy for the same active review.

### High: simultaneous Agency Brain delivery can partially fail

Agency Brain delivery is synchronous and sequential inside a function capped at 60 seconds. Agency Brain accepts at most 30 ticket creations per minute per key. Two reviewers submitting moderately large passes together can cross that rate limit. Earlier notes may already exist as tickets while the review is marked `delivery_failed`.

Internal rule until fixed: keep passes reasonably small and stagger large submissions. After an error, inspect the delivery map and Agency Brain before manually resubmitting anything.

Required fix: queue delivery work, honor `429` retry timing, and expose retry status per failed note.

### High: external success has a duplicate-ticket window

Agency Brain does not accept an idempotency key. If ticket creation succeeds but QAWELL fails before recording the returned external ID, a future retry cannot prove the ticket already exists and may create a duplicate.

Internal rule until fixed: do not blindly retry a partially failed review.

Implemented mitigation: QAWELL embeds a stable reference and reconciles it through the Agency Brain read API before creation. Remaining work: administrator-visible per-note delivery state and reconciliation beyond the most recent 500 project tickets.

### High: deleting or rotating an invitation does not revoke an active upload

Once a review row and upload nonce have been issued, archive upload validates the review and nonce but does not re-check the invitation. Deleting or rotating the invitation therefore prevents new starts but does not stop an already-started review from submitting.

Internal rule until fixed: do not delete or rotate an invitation while its reviewer is actively working.

Required fix: explicit invitation revocation semantics that invalidate outstanding unsubmitted reviews when requested.

### Medium: browser session data is origin-wide, not project-wide

Review notes use fixed `sessionStorage` keys. Different browsers and different browser tabs have separate runtime state, but a newly opened tab may inherit a copy of its opener's session storage. Projects installed on different paths of the same origin can also encounter restored state that is not keyed by project.

Internal rule until fixed: use one active QAWELL review per browser profile on a given staging origin. Test separate reviewers in separate browsers or incognito profiles.

Required fix: namespace review, identity, and hosted-session storage by project key and review/invitation identity.

### Medium: invitation counters are not atomic

The accepted-review counter is read and then written. Distinct invitations do not contend, but multiple active reviews created from the same invitation can lose increments or show misleading status.

Required fix: increment through a database function or derive completed counts exclusively from accepted review rows.

### Medium: the dashboard is refresh-based

Reviewer status, package availability, and completion counters do not update live. This does not corrupt data, but a project manager watching concurrent submissions must refresh to see current state.

## Concurrent-reviewer test matrix

Run these tests against one disposable Agency Brain QA project. Use short, uniquely worded notes so every downstream ticket can be attributed without ambiguity.

| Test | Setup | Expected result |
| --- | --- | --- |
| Two distinct reviewers | Two invitation links, two different browsers | Independent names, notes, reviews, packages, and tickets |
| Simultaneous start | Open both links and start within five seconds | Two unique review IDs and no identity crossover |
| Cross-page navigation | Both reviewers navigate several same-origin pages | Each browser retains only its own notes |
| Simultaneous submit | Each sends two notes at approximately the same time | Four tickets, two retained packages, correct note mappings |
| Same element | Both reviewers annotate the same DOM element differently | Two distinct tickets with correct reviewer identity |
| Same invitation misuse | Open one link in two isolated browsers | Second start must eventually be rejected after atomic reservation is implemented |
| Duplicate send | Double-click or replay one archive request | Exactly one accepted upload and one ticket per note |
| Partial delivery pressure | Submit enough combined notes to approach the Agency Brain rate limit | Clear failure state, retained ZIP, and per-note delivery visibility |
| Invitation rotation | Rotate an unused invite, then open old and new links | Old link rejected; new link accepted |
| Active revocation | Start, then revoke before sending | Submission rejected once revocation semantics are implemented |
| Package inspection | Download both enriched ZIPs | Each delivery map references only that review's tickets |
| Cleanup isolation | Delete one reviewer and their QA records | Other reviewer, package, mappings, and tickets remain untouched |

## Internal-use operating rules

QAWELL can be used now for real internal Agency Brain QA with these temporary rules:

1. Generate a separate invitation for every reviewer.
2. Do not share, reuse, rotate, or delete an invitation while a pass is active.
3. Have concurrent reviewers use separate browsers or isolated browser profiles.
4. Keep each pass below roughly 15 notes until queued/rate-aware delivery exists.
5. Stagger large submissions by at least one minute.
6. If submission fails after some tickets appear, do not retry blindly; inspect Agency Brain and the dashboard delivery data first.
7. Refresh the dashboard after submissions and compare package note counts with created ticket counts.

## Private-beta hardening

1. Version and roll back the installed widget instead of placing every project on an unversioned latest script.
2. Add explicit integration retry controls and reduce the external-success/database-write duplicate-ticket window.
3. Add individual review-detail and deletion controls.
4. Define and display a retention policy.
5. Smoke-test retained packages, delivery maps, screenshots, and deletion.
6. Add structured monitoring for ingestion, retention, credential, and delivery failures.

## Public-launch hardening

- Rate limits and abuse controls
- Server-side image decoding and canonicalization
- Malware scanning or a narrower documented file policy
- Server-built canonical packages and optional attestation
- Reviewer identity verification or an explicit bearer-link security policy
- Transactional invitation email
- Complete audit-event recording
- Credential rotation and integration disconnection
- Privacy policy, terms, retention disclosure, and deletion procedure
- Cross-browser and framework end-to-end automation
- Backup, migration, support, and recovery procedures
- CSP guidance and accessibility review

## Trust-boundary decision

Invitation links currently act as bearer credentials. The stored invitation email identifies the intended reviewer but is not verified at submission time. This is acceptable for an internal trusted-team release if documented. Wider use should either add optional identity verification or explicitly retain the bearer-link model.

## Recommended internal launch sequence

1. Run the concurrent-reviewer test matrix.
2. Submit another production review and verify retained enriched download contents.
3. Use QAWELL on one real project with two internal reviewers.
4. Review delivery failures and confusing ticket mappings after that pass.
5. Fix only issues that interfere with real internal work before expanding scope.

## Independent audit findings

Three independent agents were dispatched for concurrency, delivery, and practical internal-readiness audits. All three failed before analysis because the account reached its sub-agent usage limit. No independent findings were produced or represented as complete. Re-run these reviews when agent capacity is available.
