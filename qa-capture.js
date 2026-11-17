(() => {
  "use strict";

  const VERSION = "0.4.17";
  const SCHEMA = "qa-review/1";
  const INTEGRATION_NOTE_LIMIT = 25;
  const GLOBAL_KEY = "__qaCapture";
  const sourceScript = document.currentScript;
  const projectKey = sourceScript?.dataset?.project || sourceScript?.dataset?.qaProject || "local";
  const STORAGE_KEY = `__qaCaptureSession_v1:${projectKey}`;
  const IDENTITY_KEY = `__qaCaptureIdentity_v1:${projectKey}`;
  const COMPACT_KEY = `__qaCaptureCompact_v1:${projectKey}`;
  const DOCK_KEY = `__qaCaptureDock_v1:${projectKey}`;
  const HOSTED_KEY = `__qawellHostedSession_v1:${projectKey}`;
  const HOSTED_RECOVERY_KEY = `__qawellHostedActive_v1:${projectKey}`;
  const LEGACY_STORAGE_KEY = "__qaCaptureSession_v1";
  const LEGACY_IDENTITY_KEY = "__qaCaptureIdentity_v1";
  const LEGACY_HOSTED_KEY = "__qawellHostedSession_v1";
  const WIDGET_PLACEMENTS = ["bottom-right", "bottom-left", "top-left", "top-right"];
  const installationContext = captureInstallationContext(sourceScript);
  const incomingInvitationToken = readInvitationToken();
  const hosted = {
    apiBase: sourceScript?.src ? new URL(sourceScript.src).origin : "https://qawell.dev",
    projectKey: projectKey === "local" ? "" : projectKey,
    invitationToken: incomingInvitationToken,
    newInvitation: false,
    config: null,
    reviewId: null,
    resumeToken: null,
    uploadToken: null,
    uploadExpiresAt: null,
    maxArchiveBytes: 0,
    invitedReviewerName: null,
    draftRevision: 0,
    submitted: false,
  };
  restoreHostedSession();
  if (hosted.invitationToken) persistHostedSession();

  if (window[GLOBAL_KEY]) {
    if (incomingInvitationToken && window[GLOBAL_KEY].acceptInvitation) window[GLOBAL_KEY].acceptInvitation(incomingInvitationToken);
    else window[GLOBAL_KEY].addNote();
    return;
  }

  const state = {
    id: makeId("review"),
    startedAt: new Date().toISOString(),
    reviewer: "",
    notes: [],
    errors: [],
    failedRequests: [],
    selecting: false,
    hovered: null,
    assets: [],
    widgetPlacement: WIDGET_PLACEMENTS[0],
    widgetCompact: false,
  };
  restoreSession();

  const cleanup = [];
  const host = document.createElement("div");
  host.dataset.qaCaptureRoot = "";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      .qa { color:#282b27; font:13px/1.45 ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace; }
      button, input, textarea, select { font:inherit; }
      button { cursor:pointer; }
      .toolbar { position:fixed;display:flex;gap:0;align-items:center;padding:0;background:#e7e4da;border:1px solid #282b27;border-radius:0;box-shadow:7px 7px 0 #666b45;pointer-events:auto; }
      .toolbar button { min-height:42px;border:0;border-right:1px solid #282b27;border-radius:0;padding:8px 11px;background:#e7e4da;color:#282b27;font-weight:800;text-transform:uppercase;letter-spacing:.02em; }
      .toolbar button:last-child { border-right:0; }
      .toolbar button:hover { background:#d8d5ca; }
      .toolbar button.primary { background:#282b27;color:#e7e4da; }
      .toolbar button.active { background:#a84f2f;color:#e7e4da; }
      .toolbar .count { background:transparent;color:#282b27;padding:8px 10px;white-space:nowrap;text-transform:none;letter-spacing:0;font-weight:600; }
      .toolbar .count:hover { background:#d8d5ca;color:#282b27; }
      .sync-state { padding:8px 10px;color:#666b45;font-size:10px;white-space:nowrap;text-transform:uppercase; }
      .sync-state[data-state="syncing"] { color:#a84f2f; }
      .sync-state[data-state="waiting"] { color:#7c321c; }
      .well-mark { display:grid;place-items:center;width:38px;padding:0!important;background:#d8d5ca!important; }
      .well-mark img { display:block;width:31px;height:31px;object-fit:contain; }
      .mobile-well.open { display:block!important;width:min(270px,calc(100vw - 36px))!important;padding:15px; }
      .mobile-well-header { display:flex;align-items:center;gap:10px;margin-bottom:12px; }
      .mobile-well-header img { width:34px;height:34px;object-fit:contain; }
      .mobile-well-header strong,.mobile-well-header span { display:block; }
      .mobile-well-header strong { font-size:13px;letter-spacing:.06em; }
      .mobile-well-header span { margin-top:1px;color:#666b45;font-size:11px; }
      .mobile-well-actions { display:grid;border-top:1px solid #777b70; }
      .mobile-well-actions button { display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:42px;border:0;border-bottom:1px solid #777b70;padding:9px 2px;background:transparent;color:#282b27;font-weight:800;text-align:left;text-transform:uppercase; }
      .mobile-well-actions button::after { content:"→";color:#777b70; }
      .qa[data-compact="true"] .toolbar .count,.qa[data-compact="true"] .toolbar .sync-state,.qa[data-compact="true"] .toolbar [data-action="export"],.qa[data-compact="true"] .toolbar .move-widget { display:none; }
      .qa[data-compact="true"] .toolbar { box-shadow:4px 4px 0 #666b45; }
      .qa[data-compact="true"] .toolbar [data-action="select"] { width:44px;min-height:44px;padding:4px;font-size:0; }
      .qa[data-compact="true"] .toolbar [data-action="select"]::before { content:"+";font:800 23px/1 ui-sans-serif,system-ui,sans-serif; }
      .qa[data-compact="true"] .toolbar [data-action="select"].active::before { content:"×"; }
      .qa[data-compact="true"] .well-mark { width:44px;min-height:44px!important; }
      .move-widget { width:43px;padding:8px!important; }
      .move-widget-icon { display:block;width:24px;height:24px;font-size:22px;line-height:22px;text-align:center; }
      .outline { display:none;position:fixed;border:2px solid #a84f2f;background:#a84f2f1a;pointer-events:none; }
      .target-bar { display:none;position:fixed;left:14px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));max-width:420px;margin:0 auto;padding:12px;background:#e7e4da;color:#282b27;border:1px solid #282b27;box-shadow:4px 4px 0 #666b45;pointer-events:auto; }
      .target-bar.show { display:block; }
      .qa[data-placement^="bottom"] .target-bar { bottom:calc(72px + env(safe-area-inset-bottom)); }
      .target-bar-label { margin:0 0 10px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
      .target-tip { margin:0 0 10px;padding:8px;border:1px solid #a84f2f;background:#ead2c8;color:#7c321c;font:12px/1.4 ui-sans-serif,system-ui,sans-serif; }
      .target-tip[hidden] { display:none; }
      .panel.note .target-tip { margin:8px 0 0; }
      .target-bar-actions { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
      .target-bar-actions button { min-height:44px;border:1px solid #282b27;border-radius:0;padding:8px;background:transparent;color:#282b27;font-size:11px;font-weight:800;text-transform:uppercase; }
      .target-bar-actions .primary { background:#282b27;color:#e7e4da; }
      .panel { display:none;position:fixed;width:min(400px,calc(100vw - 36px));max-height:calc(100vh - 100px);overflow:auto;padding:20px;background:#e7e4da;color:#282b27;border:1px solid #282b27;border-radius:0;box-shadow:9px 9px 0 #666b45;pointer-events:auto; }
      .panel.open { display:block; }
      .qa[data-placement="bottom-right"] .toolbar { right:18px;bottom:18px; }
      .qa[data-placement="bottom-right"] .panel { right:18px;bottom:76px; }
      .qa[data-placement="bottom-left"] .toolbar { left:18px;bottom:18px; }
      .qa[data-placement="bottom-left"] .panel { left:18px;bottom:76px; }
      .qa[data-placement="top-left"] .toolbar { left:18px;top:18px; }
      .qa[data-placement="top-left"] .panel { left:18px;top:76px; }
      .qa[data-placement="top-right"] .toolbar { right:18px;top:18px; }
      .qa[data-placement="top-right"] .panel { right:18px;top:76px; }
      h2 { margin:0 0 14px;font-size:15px;text-transform:uppercase;letter-spacing:.08em; }
      label { display:block;margin:12px 0 6px;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.06em; }
      input, textarea { width:100%;border:0;border-bottom:1px solid #282b27;border-radius:0;padding:10px 2px;color:#282b27;background:transparent;outline:none; }
      input:focus, textarea:focus { border-color:#a84f2f;box-shadow:0 2px 0 #a84f2f; }
      textarea { min-height:96px;resize:vertical; }
      .actions { display:flex;justify-content:flex-end;gap:8px;margin-top:14px; }
      .actions button { border:1px solid #282b27;border-radius:0;padding:8px 11px;background:transparent;color:#282b27;text-transform:uppercase;font-weight:800;font-size:11px; }
      .actions .primary { background:#282b27;color:#e7e4da; }
      .hint { margin:8px 0 0;color:#777b70;font-size:11px; }
      .identity { margin:-4px 0 18px;padding:11px;border:1px solid #282b27;background:#d8d5ca; }
      .identity strong,.identity span,.identity em { display:block; }.identity span { margin-top:3px;color:#666b45;font-size:10px;text-transform:uppercase; }.identity em { margin-top:7px;color:#282b27;font:11px/1.35 ui-sans-serif,system-ui,sans-serif;font-style:normal; }
      .target { padding:9px;background:#d8d5ca;border:1px solid #777b70;border-radius:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px; }
      .target-warning { display:none;margin:8px 0 0;padding:8px;border:1px solid #a84f2f;color:#7c321c;background:#ead2c8;font-size:11px; }
      .target-warning.show { display:block; }
      .screenshot-drop { margin-top:6px;border:1px dashed #777b70;padding:11px;background:#d8d5ca;color:#666b45;font-size:11px; }
      .screenshot-drop.dragging { border-color:#a84f2f;background:#ead2c8; }
      .screenshot-drop input { position:absolute;width:1px;height:1px;opacity:0;pointer-events:none; }
      .screenshot-buttons { display:flex;flex-wrap:wrap;gap:8px; }
      .screenshot-buttons button { min-height:40px;border:1px solid #282b27;border-radius:0;padding:8px 11px;background:transparent;color:#282b27;font-size:11px;font-weight:800;text-transform:uppercase; }
      .screenshot-buttons .primary { background:#282b27;color:#e7e4da; }
      .screenshot-drop .hint { margin-top:8px;color:#666b45; }
      .screenshot-dialog { pointer-events:auto;width:min(340px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;margin:auto;padding:20px;border:1px solid #282b27;border-radius:0;background:#e7e4da;color:#282b27;box-shadow:6px 6px 0 #666b45; }
      .screenshot-dialog::backdrop { background:rgb(40 43 39 / .55); }
      .screenshot-dialog p,.screenshot-dialog ol { margin:0 0 12px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif; }
      .screenshot-dialog ol { padding-left:20px; }
      .screenshot-dialog li + li { margin-top:6px; }
      .screenshot-dialog .actions { margin-top:16px; }
      .field-label { display:block;margin:12px 0 6px;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.06em; }
      .screenshot-preview { display:none;margin-top:8px;grid-template-columns:80px 1fr auto;gap:9px;align-items:center; }
      .screenshot-preview.show { display:grid; }.screenshot-preview img { width:80px;height:58px;object-fit:cover;border:1px solid #282b27; }.screenshot-preview button { border:0;border-bottom:1px solid #a84f2f;padding:2px 0;background:transparent;color:#a84f2f;font-weight:800;text-transform:uppercase; }
      .types { display:flex;flex-wrap:wrap;gap:6px; }
      .type-pill { position:relative; }
      .type-pill input { position:absolute;opacity:0;pointer-events:none; }
      .type-pill span { display:block;padding:6px 9px;border:1px solid #777b70;border-radius:0;color:#666b45;cursor:pointer;text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:.05em; }
      .type-pill input:checked + span { background:#282b27;border-color:#282b27;color:#e7e4da; }
      .type-pill input:focus-visible + span { outline:2px solid #a84f2f;outline-offset:2px; }
      .note-list { display:grid;gap:8px; }
      .note-list-item { width:100%;padding:11px;border:1px solid #777b70;border-radius:0;background:transparent;color:#282b27;text-align:left; }
      .note-list-item:hover, .note-list-item.focused { border-color:#a84f2f;background:#d8d5ca; }
      .note-list-meta { display:flex;justify-content:space-between;gap:8px;margin-bottom:5px;color:#777b70;font-size:10px;text-transform:uppercase; }
      .note-list-text { display:block;font:13px/1.45 ui-sans-serif,system-ui,sans-serif; }
      .note-list-page { display:block;margin-top:6px;color:#888;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
      .note-list-actions { display:flex;justify-content:flex-end;margin-top:8px; }
      .note-list-edit { border:0;border-bottom:1px solid #a84f2f;padding:2px 0;background:transparent;color:#a84f2f;font-size:10px;font-weight:800;text-transform:uppercase; }
      .draft-list { display:grid;gap:9px; }
      .draft-item { padding:12px;border:1px solid #777b70;background:#d8d5ca; }
      .draft-item strong,.draft-item span { display:block; }
      .draft-item span { margin-top:4px;color:#666b45;font-size:10px;text-transform:uppercase; }
      .draft-actions { display:flex;flex-wrap:wrap;gap:7px;margin-top:10px; }
      .draft-actions button { border:1px solid #282b27;padding:7px 9px;background:transparent;color:#282b27;font-size:10px;font-weight:800;text-transform:uppercase; }
      .draft-actions .primary { background:#282b27;color:#e7e4da; }
      .draft-actions .danger { margin-left:auto;border-color:#a84f2f;color:#7c321c; }
      .finish-summary { padding:12px;border:1px solid #282b27;background:#d8d5ca; }
      .finish-summary strong,.finish-summary span { display:block; }
      .finish-summary span { margin-top:6px;font:12px/1.45 ui-sans-serif,system-ui,sans-serif; }
      .finish-status { min-height:18px;margin:10px 0 0;font:12px/1.45 ui-sans-serif,system-ui,sans-serif; }
      .finish-status.error { padding:9px;border:1px solid #a84f2f;background:#ead2c8;color:#7c321c; }
      .finish-status.success { color:#465225;font-weight:700; }
      button:disabled { cursor:wait;opacity:.6; }
      .pins { position:fixed;inset:0;pointer-events:none; }
      .pin { position:absolute;width:38px;height:38px;border:0;padding:0;background:transparent;filter:drop-shadow(2px 2px 0 #a84f2f);pointer-events:auto; }
      .pin img { display:block;width:38px;height:38px;object-fit:contain; }
      .pin span { position:absolute;left:50%;top:8px;display:grid;min-width:17px;height:17px;place-items:center;transform:translateX(-50%);border:1px solid #282b27;border-radius:50%;background:#e7e4da;color:#282b27;font:bold 10px/15px ui-monospace;text-align:center; }
      .toast { display:none;position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:9px 13px;border:1px solid #282b27;border-radius:0;background:#e7e4da;color:#282b27;box-shadow:4px 4px 0 #666b45; }
      .toast.show { display:block; }
      .safe-area-probe { position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
      .sheet-handle { display:block;width:100%;margin:-8px 0 10px;padding:6px 0 8px;border:0;background:transparent;color:#666b45;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase; }
      .sheet-handle::before { content:"";display:block;width:40px;height:4px;margin:0 auto 6px;background:#777b70; }
      .qa[data-aside] .panel,.qa[data-aside] .toolbar,.qa[data-aside] .pins,.qa[data-aside] .toast,.qa[data-aside] .target-bar { display:none!important; }
      @keyframes qa-sheet-in { from { transform:translateY(100%); } to { transform:none; } }
      @keyframes qa-sheet-out { from { transform:none; } to { transform:translateY(100%); } }
      @media (max-width:640px), (hover:none) and (pointer:coarse) {
        .toolbar { box-shadow:4px 4px 0 #666b45;touch-action:none; }
        .toolbar .count,.toolbar .sync-state,.toolbar [data-action="export"],.toolbar .move-widget { display:none; }
        .toolbar [data-action="select"] { width:44px;min-height:44px;padding:4px;font-size:0; }
        .toolbar [data-action="select"]::before { content:"+";font:800 23px/1 ui-sans-serif,system-ui,sans-serif; }
        .toolbar [data-action="select"].active::before { content:"×"; }
        .well-mark { width:44px;min-height:44px!important; }
        .well-mark img { width:30px;height:30px; }
        .mobile-well.open { width:min(270px,calc(100vw - 28px))!important; }
        .mobile-well [data-action="toggle-compact"] { display:none; }
        .target-warning.show { display:none; }
        .panel { width:calc(100vw - 28px);max-height:calc(100dvh - 86px);padding:16px; }
        .qa[data-placement="bottom-right"] .toolbar { right:14px;bottom:14px; }
        .qa[data-placement="bottom-right"] .panel { right:14px;bottom:66px; }
        .qa[data-placement="bottom-left"] .toolbar { left:14px;bottom:14px; }
        .qa[data-placement="bottom-left"] .panel { left:14px;bottom:66px; }
        .qa[data-placement="top-left"] .toolbar { left:14px;top:14px; }
        .qa[data-placement="top-left"] .panel { left:14px;top:66px; }
        .qa[data-placement="top-right"] .toolbar { right:14px;top:14px; }
        .qa[data-placement="top-right"] .panel { right:14px;top:66px; }
        .qa[data-placement] .panel:not(.mobile-well) { top:auto;left:0;right:0;bottom:var(--qa-keyboard,0px);width:100%;max-width:640px;margin:0 auto;max-height:min(75dvh,calc(var(--qa-visible-height,100dvh) - 12px));padding:16px 16px calc(16px + env(safe-area-inset-bottom));border-width:1px 1px 0;box-shadow:0 -4px 0 #666b45; }
        .qa[data-placement] .panel.note { height:min(75dvh,calc(var(--qa-visible-height,100dvh) - 12px));padding-bottom:0; }
        .panel.note .actions { position:sticky;bottom:0;margin:14px -16px 0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#e7e4da;border-top:1px solid #777b70; }
        .panel.open:not(.mobile-well) { animation:qa-sheet-in 220ms ease-out; }
        .panel.note.leaving { animation:qa-sheet-out 200ms ease-in forwards; }
        .qa[data-sheet="true"] .toolbar { display:none; }
      }
      @media (prefers-reduced-motion:reduce) {
        .panel.open:not(.mobile-well),.panel.note.leaving { animation:none; }
      }
    </style>
    <div class="qa" data-placement="${state.widgetPlacement}">
      <div class="pins"></div>
      <div class="outline"></div>
      <div class="target-bar" role="group" aria-label="Selected element">
        <p class="target-bar-label" data-target-label role="status"></p>
        <p class="target-tip" data-bar-tip hidden>This looks like something that can close, like a menu. Use Take screenshot in your note while it is still open.</p>
        <div class="target-bar-actions"><button data-action="choose-different">Choose a different area</button><button class="primary" data-action="confirm-target">Make a note on this</button></div>
      </div>
      <section class="panel setup open" aria-label="QAWELL setup">
        <h2 data-setup-heading>Start a QA review</h2>
        <div class="identity"><strong data-identity-project>Loading project…</strong><span data-identity-owner>QAWELL review utility</span><em data-identity-environment></em><em data-identity-delivery></em></div>
        <label for="reviewer">Your name</label>
        <input id="reviewer" autocomplete="name" placeholder="Bob Sacamano">
        <p class="hint">Stored only in the review data you download.</p>
        <div class="actions"><button data-action="dismiss-setup">Skip for now</button><button class="primary" data-action="start">Start review</button></div>
      </section>
      <section class="panel draft-chooser" aria-label="Unsubmitted QA sessions">
        <h2>Unsubmitted QA sessions</h2>
        <p>Continue a saved session, review it before sending, or start a new QA pass.</p>
        <div class="draft-list"></div>
        <p class="finish-status" data-draft-status role="status"></p>
        <div class="actions"><button class="primary" data-action="start-new-session">Start a new QA pass</button></div>
      </section>
      <section class="panel note" aria-label="Add QA note">
        <button type="button" class="sheet-handle" data-action="show-page">Show page</button>
        <h2>Add note</h2>
        <div class="target"></div>
        <p class="target-tip" data-note-tip hidden>This looks like something that can close, like a menu. Use Take screenshot while it is still open.</p>
        <p class="target-tip" data-target-closed role="status" hidden></p>
        <p class="target-warning">Large area selected. Choose a smaller element for a more precise note, or keep this selection and attach a screenshot if the larger area is intentional.</p>
        <label>Type</label>
        <div class="types" role="radiogroup" aria-label="Note type">
          <label class="type-pill"><input type="radio" name="kind" value="note" checked><span>Note</span></label>
          <label class="type-pill"><input type="radio" name="kind" value="bug"><span>Bug</span></label>
          <label class="type-pill"><input type="radio" name="kind" value="copy"><span>Copy</span></label>
          <label class="type-pill"><input type="radio" name="kind" value="design"><span>Design</span></label>
          <label class="type-pill"><input type="radio" name="kind" value="question"><span>Question</span></label>
        </div>
        <label for="note-text">Feedback</label>
        <textarea id="note-text" placeholder="What should change?"></textarea>
        <p class="field-label" id="screenshot-label">Screenshot <span class="hint">optional</span></p>
        <div class="screenshot-drop" role="group" aria-labelledby="screenshot-label">
          <div class="screenshot-buttons"><button type="button" class="primary" data-action="take-screenshot">Take screenshot</button><button type="button" data-action="attach-screenshot">Attach image</button></div>
          <p class="hint" data-screenshot-hint></p>
          <input id="note-screenshot" type="file" accept="image/png,image/jpeg,image/webp" tabindex="-1" aria-label="Screenshot image file"><div class="screenshot-preview"><img alt="Screenshot preview"><span data-screenshot-meta></span><button type="button" data-action="remove-screenshot">Remove</button></div></div>
        <div class="actions"><button data-action="reselect">Choose again</button><button data-action="cancel-note">Cancel</button><button class="primary" data-action="save-note">Save note</button></div>
      </section>
      <section class="panel info" aria-label="QAWELL information">
        <h2>QAWELL</h2>
        <div class="identity"><strong data-info-project>Unassigned review</strong><span data-info-owner>QAWELL</span><em data-info-environment></em><em data-info-delivery>Notes will download as a ZIP.</em></div>
        <p>This tool records your notes and ordinary page context. It does not read cookies, existing site storage, form values, request bodies, or request headers.</p>
        <div class="actions"><button data-action="close-info">Close</button><button data-action="destroy">Remove tool</button></div>
      </section>
      <section class="panel review-notes" aria-label="Saved QA notes">
        <h2>Saved notes</h2>
        <div class="note-list"></div>
        <div class="actions"><button data-action="close-notes">Close</button></div>
      </section>
      <section class="panel finish" aria-label="Finish QA review">
        <h2 data-finish-heading>Send this review?</h2>
        <div class="finish-summary"><strong data-finish-count>0 notes</strong><span data-finish-destination></span></div>
        <p class="finish-status" data-finish-status role="status"></p>
        <div class="actions"><button data-action="cancel-finish">Keep reviewing</button><button data-action="recovery-download" hidden>Download recovery ZIP</button><button data-action="new-pass" hidden>Start another QA pass</button><button class="primary" data-action="confirm-submit">Confirm &amp; send</button></div>
      </section>
      <section class="panel invitation-switch" aria-label="Start invited QA review">
        <h2>New invitation found</h2>
        <div class="identity"><strong data-switch-project>Invited review</strong><span>Your previous QAWELL session is still open</span><em data-switch-summary></em><em data-switch-destination></em></div>
        <p class="hint">Starting this invitation replaces the current browser session. Download the current review first if you need to keep it.</p>
        <p class="finish-status" data-switch-status role="status"></p>
        <div class="actions"><button data-action="keep-current">Keep current</button><button data-action="download-and-switch">Download current &amp; start</button><button class="primary" data-action="start-invite">Start invited review</button></div>
      </section>
      <div class="toolbar" hidden>
        <button class="well-mark" data-action="well" aria-label="Open QAWELL review controls"><img src="https://qawell.dev/icon.png" alt=""></button>
        <button data-action="select" class="primary">＋ Add note</button>
        <button data-action="list" class="count" title="View saved notes">0 notes</button>
        <span class="sync-state" data-sync-status data-state="local">Saved locally</span>
        <button data-action="export">Export ZIP</button>
        <button class="move-widget" data-action="move-widget" title="Move widget" aria-label="Move widget"><span class="move-widget-icon" aria-hidden="true"></span></button>
      </div>
      <section class="panel mobile-well" aria-label="QAWELL review controls">
        <div class="mobile-well-header"><img src="https://qawell.dev/icon.png" alt=""><div><strong>QAWELL</strong><span data-mobile-count>No notes yet</span><span data-sync-status data-state="local">Saved locally</span></div></div>
        <div class="mobile-well-actions">
          <button data-action="list">Saved notes</button>
          <button data-action="export">Finish and send</button>
          <button data-action="edit-reviewer">Change reviewer name</button>
          <button data-action="toggle-compact">Minimize widget</button>
          <button data-action="info">About this review</button>
          <button data-action="move-widget">Move the well</button>
        </div>
      </section>
      <dialog class="screenshot-dialog" aria-labelledby="screenshot-dialog-title">
        <h2 id="screenshot-dialog-title">Take a screenshot</h2>
        <p>Phones don't let websites take screenshots automatically, so you'll take this one yourself.</p>
        <ol>
          <li>Press <strong>Hide QAWELL</strong> below. If what you're commenting on has closed, reopen it. Stay on this page.</li>
          <li>Take a screenshot with your phone's buttons.</li>
          <li>Press the QAWELL icon to bring QAWELL back and attach your screenshot.</li>
        </ol>
        <div class="actions"><button type="button" data-action="close-screenshot-dialog">Cancel</button><button type="button" class="primary" data-action="hide-for-screenshot" autofocus>Hide QAWELL</button></div>
      </dialog>
      <div class="toast" role="status"></div>
      <div class="safe-area-probe" aria-hidden="true"></div>
    </div>`;

  const $ = (selector) => root.querySelector(selector);
  const toolbar = $(".toolbar");
  const toolbarExport = $(".toolbar [data-action=export]");
  const mobileExport = $(".mobile-well [data-action=export]");
  const outline = $(".outline");
  const notePanel = $(".panel.note");
  const targetBar = $(".target-bar");
  const screenshotDialog = $(".screenshot-dialog");
  const qa = $(".qa");
  const sheetLayout = matchMedia("(max-width:640px), (hover:none) and (pointer:coarse)");

  // The out-of-the-way marker lives in its own host so it can blend with the page
  // (mix-blend-mode: difference inverts the white icon against whatever is behind
  // it) without also inverting the selection highlight in the main host.
  const markerHost = document.createElement("div");
  markerHost.dataset.qaCaptureMarker = "";
  markerHost.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;mix-blend-mode:difference;display:none";
  document.documentElement.appendChild(markerHost);
  cleanup.push(() => markerHost.remove());
  const markerRoot = markerHost.attachShadow({ mode: "open" });
  markerRoot.innerHTML = `
    <style>
      :host { all: initial; }
      button { position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));box-sizing:border-box;width:48px;height:48px;padding:6px;border:1px solid #fff;border-radius:50%;background:transparent;cursor:pointer;pointer-events:auto;touch-action:none;animation:qa-breathe 2.4s ease-in-out infinite; }
      button:focus-visible { outline:2px solid #fff;outline-offset:3px; }
      img { display:block;width:100%;height:100%;object-fit:contain;filter:brightness(0) invert(1);pointer-events:none; }
      button[data-tone="dark"] { border-color:#000; }
      button[data-tone="dark"] img { filter:brightness(0); }
      @keyframes qa-breathe { 0%,100% { opacity:.55;transform:scale(1); } 50% { opacity:1;transform:scale(1.08); } }
      @media (prefers-reduced-motion:reduce) { button { animation:none;opacity:.85; } }
    </style>
    <button type="button" data-action="return-to-note" aria-label="Return to your note"><img src="https://qawell.dev/icon.png" alt=""></button>`;
  const markerButton = markerRoot.querySelector("button");
  let aside = null;
  let markerDrag = null;
  let markerMoved = false;
  let pendingTarget = null;
  let pendingClick = null;
  let pendingContext = null;
  let pendingViewport = null;
  let candidate = null;
  let targetWatch = null;
  let lastTouchSelectionAt = -Infinity;
  let pendingScreenshot = null;
  let editingNoteId = null;
  let editingReviewer = false;
  let availableDrafts = [];
  const mobileExportObserver = new MutationObserver(syncMobileExport);
  mobileExportObserver.observe(toolbarExport, { attributes:true, attributeFilter:["disabled"], childList:true, characterData:true, subtree:true });
  cleanup.push(() => mobileExportObserver.disconnect());
  syncMobileExport();
  updateWidgetPlacement();
  updateWidgetMode();
  renderScreenshotControls();

  async function handleWidgetClick(event) {
    const origin = event.composedPath()[0];
    if (!(origin instanceof Element)) return;
    // A tap on the dialog's backdrop lands on the dialog element itself.
    if (origin === screenshotDialog) {
      const box = screenshotDialog.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
      if (outside) closeScreenshotDialog();
      return;
    }
    const action = origin.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (dockMoved && origin.closest(".toolbar")) { dockMoved = false; return; }
    if (action === "start") await startReview();
    if (action === "continue-draft") await continueDraft(origin.closest("[data-review-id]")?.dataset.reviewId, false);
    if (action === "submit-draft") await continueDraft(origin.closest("[data-review-id]")?.dataset.reviewId, true);
    if (action === "discard-draft") await discardDraft(origin.closest("[data-review-id]")?.dataset.reviewId);
    if (action === "start-new-session") startNewSessionFromChooser();
    if (action === "dismiss-setup") await dismissReviewerSetup();
    if (action === "select") toggleSelection();
    if (action === "confirm-target") confirmCandidate();
    if (action === "choose-different") chooseDifferentArea();
    if (action === "show-page") stepAside("reference");
    if (action === "return-to-note") { if (markerMoved) markerMoved = false; else returnFromAside(); }
    if (action === "take-screenshot") takeScreenshot();
    if (action === "attach-screenshot") $("#note-screenshot").click();
    if (action === "close-screenshot-dialog") closeScreenshotDialog();
    if (action === "hide-for-screenshot") { closeScreenshotDialog(); stepAside("screenshot"); }
    if (action === "reselect") reselectTarget();
    if (action === "cancel-note") closeNote();
    if (action === "save-note") await saveNote();
    if (action === "remove-screenshot") clearPendingScreenshot();
    if (action === "export") await finishReview();
    if (action === "move-widget") moveWidget();
    if (action === "cancel-finish") openPanel(null);
    if (action === "confirm-submit") await submitHostedReview();
    if (action === "new-pass") await startFreshHostedPass();
    if (action === "recovery-download") await exportZip(true);
    if (action === "keep-current") keepCurrentReview();
    if (action === "download-and-switch") { await exportZip(true); await beginInvitedReview(); }
    if (action === "start-invite") await beginInvitedReview();
    if (action === "list") renderNotesPanel();
    if (action === "view-note") renderNotesPanel(origin.closest("[data-note-id]")?.dataset.noteId);
    if (action === "edit-note") editNote(origin.closest("[data-note-id]")?.dataset.noteId);
    if (action === "close-notes") openPanel(null);
    if (action === "well") openWell();
    if (action === "toggle-compact") toggleCompactMode();
    if (action === "edit-reviewer") openReviewerEditor();
    if (action === "info") openPanel("info");
    if (action === "close-info") openPanel(null);
    if (action === "destroy") destroy();
  }

  // Page code must never see interaction with the widget: a tap on QAWELL would
  // otherwise count as an "outside click" and close the menu being reviewed.
  // While targeting, page taps are swallowed so they select instead of activate.
  // Window capture runs before document and element listeners; listeners the page
  // registered on window capture before QAWELL loaded still run first.
  const PAGE_INTERCEPTED_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "dblclick"];
  // wheel and touchmove are shielded so page scroll locks (react-remove-scroll,
  // body-scroll-lock) cannot stop the widget's own panels from scrolling.
  const WIDGET_SHIELDED_EVENTS = [...PAGE_INTERCEPTED_EVENTS, "keydown", "keyup", "keypress", "focus", "focusin", "wheel", "touchmove"];
  const PASSIVE_EVENTS = new Set(["touchstart", "touchmove", "wheel"]);
  for (const type of WIDGET_SHIELDED_EVENTS) on(window, type, routeInteraction, PASSIVE_EVENTS.has(type) ? { capture:true, passive:true } : true);
  on(window, "focusout", shieldFocusLoss, true);
  on(window, "blur", shieldFocusLoss, true);
  on(document, "pointermove", handlePointerMove, true);
  on(markerButton, "pointermove", dragMarker);
  on(markerButton, "pointercancel", () => { markerDrag = null; });
  if (window.visualViewport) {
    on(visualViewport, "resize", updateViewportInsets);
    on(visualViewport, "scroll", updateViewportInsets);
    updateViewportInsets();
  }
  on(window, "scroll", refreshOverlay, true);
  on(window, "resize", refreshOverlay);
  on(window, "resize", applyDockPosition);
  on(toolbar, "pointermove", dragDock);
  on(toolbar, "pointercancel", () => { dockDrag = null; });
  if (typeof sheetLayout.addEventListener === "function") on(sheetLayout, "change", applyDockPosition);
  else { sheetLayout.addListener?.(applyDockPosition); cleanup.push(() => sheetLayout.removeListener?.(applyDockPosition)); }
  if (window.ResizeObserver) {
    const dockResizeObserver = new ResizeObserver(() => applyDockPosition());
    dockResizeObserver.observe(toolbar);
    cleanup.push(() => dockResizeObserver.disconnect());
  }
  on($("#note-screenshot"), "change", async (event) => { const file = event.target.files?.[0]; if (file) await prepareScreenshot(file); });
  on(notePanel, "paste", async (event) => { const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith("image/")); if (file) { event.preventDefault(); await prepareScreenshot(file); } });
  on($(".screenshot-drop"), "dragover", (event) => { event.preventDefault(); $(".screenshot-drop").classList.add("dragging"); });
  on($(".screenshot-drop"), "dragleave", () => $(".screenshot-drop").classList.remove("dragging"));
  on($(".screenshot-drop"), "drop", async (event) => { event.preventDefault(); $(".screenshot-drop").classList.remove("dragging"); const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith("image/")); if (file) await prepareScreenshot(file); });
  on(window, "hashchange", () => {
    const token = readInvitationToken();
    if (token) acceptInvitation(token);
  });
  on(window, "online", () => {
    if (hosted.reviewId && hosted.resumeToken && !canSubmitHostedReview()) void reconnectDraftSession();
    else void syncAllDraftNotes();
  });
  on(window, "error", (event) => {
    state.errors.push({
      type: "error",
      message: truncate(event.message || "Script error", 1000),
      source: cleanUrl(event.filename),
      line: event.lineno || null,
      column: event.colno || null,
      at: new Date().toISOString(),
    });
    trimDiagnostics();
  });
  on(window, "unhandledrejection", (event) => {
    state.errors.push({ type: "unhandledrejection", message: truncate(safeString(event.reason), 1000), at: new Date().toISOString() });
    trimDiagnostics();
  });

  instrumentFetch();
  instrumentXHR();

  window[GLOBAL_KEY] = {
    version: VERSION,
    open: () => openPanel(toolbar.hidden ? "setup" : "info"),
    addNote: beginAddingNote,
    acceptInvitation,
    export: exportZip,
    destroy,
    reset: resetSession,
    getData: buildReview,
  };

  updatePins();
  loadHostedConfig();

  if (hosted.newInvitation && state.reviewer) {
    toolbar.hidden = true;
    renderInvitationSwitch();
  } else if (state.reviewer) {
    $("#reviewer").value = state.reviewer;
    toolbar.hidden = false;
    openPanel(null);
    updatePins();
    toggleSelection(false);
    toast("Review restored");
    if (hosted.reviewId && hosted.resumeToken) void reconnectDraftSession();
    else if (hosted.projectKey && hosted.invitationToken) void upgradeLocalSession();
  }

  async function startReview() {
    const startButton = $("[data-action=start]");
    if (startButton.disabled) return;
    startButton.disabled = true;
    startButton.textContent = editingReviewer ? "Saving…" : hosted.invitationToken ? "Starting invited review…" : "Starting…";
    state.reviewer = $("#reviewer").value.trim() || "Bob Sacamano";
    try {
      if (hosted.projectKey && hosted.invitationToken && hosted.reviewId && hosted.resumeToken && !editingReviewer) await startHostedReview();
      else if (hosted.projectKey && hosted.invitationToken && (!hosted.reviewId || !hosted.resumeToken)) await startHostedReview();
      else if (editingReviewer && hosted.reviewId && hosted.resumeToken) await syncReviewerName();
      persistSession();
      toolbar.hidden = false;
      openPanel(null);
      toggleSelection(false);
      toast(editingReviewer ? "Reviewer name saved" : "Review ready — use Add note when you are ready");
      setReviewerSetupMode(false);
    } catch (error) {
      toast(safeString(error));
    } finally {
      startButton.disabled = false;
      startButton.textContent = editingReviewer ? "Save name" : "Start review";
    }
  }

  async function dismissReviewerSetup() {
    $("#reviewer").value = "Bob Sacamano";
    await startReview();
  }

  async function loadUnsubmittedSessions() {
    if (!hosted.projectKey || !hosted.invitationToken || hosted.reviewId) return [];
    const query = new URLSearchParams({ projectKey:hosted.projectKey, origin:location.origin });
    const response = await fetch(`${hosted.apiBase}/api/v1/reviews?${query}`, { headers:{ Accept:"application/json", Authorization:`Bearer ${hosted.invitationToken}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load unsubmitted QA sessions");
    availableDrafts = result.sessions || [];
    return availableDrafts;
  }

  async function showUnsubmittedSessions() {
    const status = $("[data-draft-status]");
    status.textContent = "Checking for saved sessions…";
    status.className = "finish-status";
    try {
      const drafts = await loadUnsubmittedSessions();
      if (!drafts.length) {
        status.textContent = "";
        openPanel("setup");
        return;
      }
      renderDraftChooser(drafts);
      openPanel("draft-chooser");
    } catch (error) {
      status.textContent = safeString(error);
      status.className = "finish-status error";
      openPanel("draft-chooser");
    }
  }

  function renderDraftChooser(drafts) {
    const list = $(".draft-list");
    list.textContent = "";
    for (const draft of drafts) {
      const item = document.createElement("article");
      item.className = "draft-item";
      item.dataset.reviewId = draft.reviewId;
      const name = document.createElement("strong");
      name.textContent = draft.reviewerName || "Unnamed reviewer";
      const details = document.createElement("span");
      const updated = new Intl.DateTimeFormat(undefined, { dateStyle:"medium", timeStyle:"short" }).format(new Date(draft.updatedAt));
      details.textContent = `${draft.noteCount} ${draft.noteCount === 1 ? "note" : "notes"} · Updated ${updated}`;
      const actions = document.createElement("div");
      actions.className = "draft-actions";
      actions.innerHTML = `<button class="primary" data-action="continue-draft">Continue</button><button data-action="submit-draft">Review &amp; submit</button><button class="danger" data-action="discard-draft">Discard</button>`;
      item.append(name, details, actions);
      list.appendChild(item);
    }
    $("[data-draft-status]").textContent = "";
    $("[data-draft-status]").className = "finish-status";
  }

  async function continueDraft(reviewId, openFinish) {
    if (!reviewId) return;
    setDraftChooserBusy(true, "Restoring session…");
    try {
      await startHostedReview({ recoverReviewId:reviewId });
      toolbar.hidden = false;
      openPanel(null);
      toggleSelection(false);
      toast("Unsubmitted QA session restored");
      if (openFinish) await finishReview();
    } catch (error) {
      setDraftChooserBusy(false, safeString(error), true);
    }
  }

  async function discardDraft(reviewId) {
    if (!reviewId || !confirm("Discard this unsubmitted QA session? Its notes and screenshots will be removed.")) return;
    setDraftChooserBusy(true, "Discarding session…");
    try {
      await startHostedReview({ recoverReviewId:reviewId, hydrate:false });
      const response = await fetch(`${hosted.apiBase}/api/v1/reviews/${hosted.reviewId}/draft`, { method:"DELETE", headers:{ Authorization:`Bearer ${hosted.resumeToken}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not discard this session");
      clearHostedReviewState();
      toast("Unsubmitted session discarded");
      await showUnsubmittedSessions();
    } catch (error) {
      setDraftChooserBusy(false, safeString(error), true);
    }
  }

  function startNewSessionFromChooser() {
    clearHostedReviewState();
    state.reviewer = "";
    $("#reviewer").value = "";
    setReviewerSetupMode(false);
    openPanel("setup");
  }

  function clearHostedReviewState() {
    hosted.reviewId = null;
    hosted.resumeToken = null;
    hosted.uploadToken = null;
    hosted.uploadExpiresAt = null;
    hosted.draftRevision = 0;
    state.id = makeId("review");
    state.startedAt = new Date().toISOString();
    state.notes = [];
    state.assets = [];
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(IDENTITY_KEY);
    localStorage.removeItem(HOSTED_RECOVERY_KEY);
    persistHostedSession();
    updatePins();
  }

  function setDraftChooserBusy(busy, message, error = false) {
    root.querySelectorAll(".draft-chooser button").forEach((button) => { button.disabled = busy; });
    const status = $("[data-draft-status]");
    status.textContent = message;
    status.className = `finish-status${error ? " error" : ""}`;
  }

  function openReviewerEditor() {
    setReviewerSetupMode(true);
    $("#reviewer").value = state.reviewer || "Bob Sacamano";
    openPanel("setup");
    $("#reviewer").focus();
    $("#reviewer").select();
  }

  function setReviewerSetupMode(editing) {
    editingReviewer = editing;
    $("[data-setup-heading]").textContent = editing ? "Reviewer name" : "Start a QA review";
    $("[data-action=dismiss-setup]").hidden = editing;
    $("[data-action=start]").textContent = editing ? "Save name" : "Start review";
  }

  function renderInvitationSwitch() {
    $("[data-switch-project]").textContent = hosted.config?.project || installationContext.project || "Invited review";
    $("[data-switch-summary]").textContent = state.notes.length ? `The current session contains ${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}.` : "The current session has no saved notes.";
    $("[data-switch-destination]").textContent = hosted.config?.delivery?.mode === "integration" ? `The invited review will send to ${hostedDestination()}.` : "The invited review will produce a validated ZIP.";
    openPanel("invitation-switch");
  }

  function acceptInvitation(token) {
    if (!token) return;
    if (token === hosted.invitationToken) {
      if (hosted.reviewId && hosted.resumeToken) void reconnectDraftSession();
      return;
    }
    if (hosted.reviewId && hosted.resumeToken) {
      hosted.invitationToken = token;
      hosted.newInvitation = false;
      persistHostedSession();
      void reconnectDraftSession();
      return;
    }
    hosted.invitationToken = token;
    hosted.newInvitation = true;
    hosted.reviewId = null;
    hosted.resumeToken = null;
    hosted.uploadToken = null;
    hosted.uploadExpiresAt = null;
    hosted.draftRevision = 0;
    hosted.submitted = false;
    persistHostedSession();
    loadHostedConfig();
    if (state.reviewer) {
      toggleSelection(false);
      toolbar.hidden = true;
      renderInvitationSwitch();
    } else {
      openPanel("setup");
    }
  }

  function keepCurrentReview() {
    hosted.invitationToken = "";
    hosted.newInvitation = false;
    hosted.reviewId = null;
    hosted.resumeToken = null;
    hosted.uploadToken = null;
    hosted.uploadExpiresAt = null;
    hosted.draftRevision = 0;
    sessionStorage.removeItem(HOSTED_KEY);
    localStorage.removeItem(HOSTED_RECOVERY_KEY);
    toolbar.hidden = false;
    renderHostedIdentity();
    openPanel(null);
  }

  async function beginInvitedReview() {
    const buttons = root.querySelectorAll(".invitation-switch button");
    buttons.forEach((button) => { button.disabled = true; });
    $("[data-switch-status]").textContent = "Starting the invited review…";
    const previousReviewer = state.reviewer;
    hosted.reviewId = null;
    hosted.resumeToken = null;
    hosted.uploadToken = null;
    hosted.uploadExpiresAt = null;
    hosted.draftRevision = 0;
    hosted.submitted = false;
    try {
      await startHostedReview();
      hosted.newInvitation = false;
      persistHostedSession();
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(IDENTITY_KEY);
      state.id = makeId("review");
      state.startedAt = new Date().toISOString();
      state.reviewer = hosted.invitedReviewerName || previousReviewer;
      state.notes = [];
      state.assets = [];
      persistSession();
      updatePins();
      toolbar.hidden = false;
      openPanel(null);
      toggleSelection(false);
      toast("Invited review ready — use Add note when you are ready");
    } catch (error) {
      $("[data-switch-status]").textContent = safeString(error);
      $("[data-switch-status]").className = "finish-status error";
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function beginAddingNote() {
    if (aside) leaveAside();
    if (hosted.submitted) {
      openPanel("finish");
      toast("Start a fresh QA pass before adding another note");
      return;
    }
    if (!state.reviewer) {
      openPanel("setup");
      $("#reviewer").focus();
      return;
    }
    toolbar.hidden = false;
    openPanel(null);
    toggleSelection(true);
    toast("Select an element");
  }

  function toggleSelection(force) {
    const nextSelecting = typeof force === "boolean" ? force : !state.selecting;
    if (nextSelecting && atIntegrationNoteLimit()) {
      state.selecting = false;
      toast(`This QA pass has ${INTEGRATION_NOTE_LIMIT} notes — submit it to keep going`);
      finishReview();
      return;
    }
    state.selecting = nextSelecting;
    $("[data-action=select]").classList.toggle("active", state.selecting);
    $("[data-action=select]").textContent = state.selecting ? "Cancel selection" : "＋ Add note";
    $("[data-action=select]").setAttribute("aria-label", state.selecting ? "Cancel note selection" : "Add a QA note");
    if (!state.selecting) clearCandidate();
  }

  function routeInteraction(event) {
    if (event.target === host || event.target === markerHost) {
      event.stopImmediatePropagation();
      if (event.type === "click") void handleWidgetClick(event);
      if (event.type === "pointerdown" || event.type === "pointerup") {
        if (event.target === markerHost) handleMarkerPointer(event);
        else handleDockPointer(event);
      }
      return;
    }
    if (!PAGE_INTERCEPTED_EVENTS.includes(event.type)) return;
    // Screenshot mode leaves the page usable so a closed menu can be reopened.
    if (aside === "reference") blockPageEvent(event);
    else if (aside) return;
    else if (state.selecting) interceptPageEvent(event);
  }

  // Focus moving into the widget must not look like focus leaving the page's menu.
  function shieldFocusLoss(event) {
    if (event.relatedTarget === host || event.relatedTarget === markerHost) event.stopImmediatePropagation();
  }

  // While the widget is out of the way the page can be scrolled and zoomed but not
  // activated, so a stray tap cannot navigate away from an unsaved note.
  function blockPageEvent(event) {
    event.stopImmediatePropagation();
    if (event.type !== "pointerdown" && event.type !== "touchstart" && event.cancelable) event.preventDefault();
  }

  let steppingAside = false;
  function stepAside(mode) {
    if (aside || steppingAside) return;
    steppingAside = true;
    markerButton.setAttribute("aria-label", mode === "screenshot" ? "Return to your note and attach your screenshot" : "Return to your note");
    const finish = () => {
      steppingAside = false;
      notePanel.classList.remove("leaving");
      // The note was saved or cancelled during the slide-out animation.
      if (!notePanel.classList.contains("open")) return;
      aside = mode;
      qa.dataset.aside = aside;
      markerHost.style.display = "block";
      clampMarker();
      updateMarkerTone();
      syncHighlight();
      markerButton.focus({ preventScroll:true });
    };
    if (!sheetLayout.matches || matchMedia("(prefers-reduced-motion: reduce)").matches) { finish(); return; }
    let finished = false;
    const finishOnce = () => { if (!finished) { finished = true; finish(); } };
    notePanel.classList.add("leaving");
    notePanel.addEventListener("animationend", finishOnce, { once:true });
    setTimeout(finishOnce, 400);
  }

  function leaveAside() {
    aside = null;
    delete qa.dataset.aside;
    markerHost.style.display = "none";
    syncHighlight();
  }

  function returnFromAside() {
    if (!aside) return;
    const returningFromScreenshot = aside === "screenshot";
    leaveAside();
    if (!returningFromScreenshot) { $("[data-action=show-page]").focus({ preventScroll:true }); return; }
    // The tap on the marker is a user gesture, so the photo picker can open directly.
    const attach = $("[data-action=attach-screenshot]");
    attach.textContent = "Attach your screenshot";
    attach.classList.add("primary");
    $("[data-action=take-screenshot]").classList.remove("primary");
    attach.focus({ preventScroll:true });
    $("#note-screenshot").click();
  }

  // Desktop browsers can capture the tab through screen sharing, with the
  // reviewer's permission each time. Mobile browsers cannot, so phones use the
  // device's own screenshot buttons while QAWELL steps aside.
  function isTouchPrimary() {
    return matchMedia("(hover:none) and (pointer:coarse)").matches;
  }

  // getDisplayMedia exists only in secure (HTTPS) contexts on desktop browsers, and
  // only Chromium browsers (which expose userAgentData) can share a single tab.
  // Elsewhere the reviewer would have to share a whole window or screen.
  function canCaptureScreen() {
    return typeof navigator.mediaDevices?.getDisplayMedia === "function" && "userAgentData" in navigator && !isTouchPrimary();
  }

  function renderScreenshotControls() {
    const attach = $("[data-action=attach-screenshot]");
    attach.textContent = "Attach image";
    attach.classList.remove("primary");
    $("[data-action=take-screenshot]").classList.add("primary");
    closeScreenshotDialog();
    const capture = canCaptureScreen();
    const touch = isTouchPrimary();
    $("[data-action=take-screenshot]").hidden = !capture && !touch;
    if (!capture && !touch) attach.classList.add("primary");
    $("[data-screenshot-hint]").textContent = capture
      ? "Take screenshot captures this tab; your browser asks permission each time. You can also attach, paste, or drop a PNG, JPEG, or WebP image up to 5 MB. QAWELL removes image metadata."
      : touch
        ? "Take screenshot moves QAWELL out of the way so you can use your phone's screenshot buttons. Images up to 5 MB; QAWELL removes image metadata."
        : "Attach, paste, or drop a PNG, JPEG, or WebP image up to 5 MB. QAWELL removes image metadata.";
  }

  function takeScreenshot() {
    if (canCaptureScreen()) void captureTab();
    else openScreenshotDialog();
  }

  // iOS Safari before 15.4 has no HTMLDialogElement methods; fall back to the attribute.
  function openScreenshotDialog() {
    if (typeof screenshotDialog.showModal === "function") screenshotDialog.showModal();
    else screenshotDialog.setAttribute("open", "");
  }

  function closeScreenshotDialog() {
    if (!screenshotDialog.hasAttribute("open")) return;
    if (typeof screenshotDialog.close === "function") screenshotDialog.close();
    else screenshotDialog.removeAttribute("open");
  }

  let capturingTab = false;
  async function captureTab() {
    if (capturingTab) return;
    capturingTab = true;
    host.style.visibility = "hidden";
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video:{ displaySurface:"browser" },
        audio:false,
        preferCurrentTab:true,
        selfBrowserSurface:"include",
        surfaceSwitching:"exclude",
        systemAudio:"exclude",
      });
      const surface = stream.getVideoTracks()[0]?.getSettings?.().displaySurface;
      if (surface && surface !== "browser") throw Object.assign(new Error("Only a browser tab can be captured"), { name:"NotTabError" });
      const blob = await grabFrame(stream);
      stream.getTracks().forEach((track) => track.stop());
      host.style.visibility = "";
      await prepareScreenshot(new File([blob], "screenshot.jpg", { type:"image/jpeg" }));
    } catch (error) {
      toast(error?.name === "NotAllowedError" ? "Screenshot cancelled" : error?.name === "NotTabError" ? "Choose this tab to take a screenshot" : "Could not take a screenshot");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      host.style.visibility = "";
      capturingTab = false;
    }
  }

  function withTimeout(promise, ms) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Timed out")), ms); })]).finally(() => clearTimeout(timer));
  }

  async function grabFrame(stream) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await withTimeout(video.play(), 4000);
    if (!video.videoWidth) await withTimeout(new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once:true })), 2000);
    // Give the page a moment to repaint without the widget before the frame is taken.
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!video.videoWidth || !video.videoHeight) throw new Error("The shared tab produced no image");
    const scale = Math.min(1, 2560 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    video.pause();
    video.srcObject = null;
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not read the screenshot")), "image/jpeg", .92));
  }

  function handleMarkerPointer(event) {
    if (event.type === "pointerup") { markerDrag = null; return; }
    const rect = markerButton.getBoundingClientRect();
    markerDrag = { id:event.pointerId, x:event.clientX, y:event.clientY, left:rect.left, top:rect.top };
    markerMoved = false;
    markerButton.setPointerCapture?.(event.pointerId);
  }

  function dragMarker(event) {
    if (!markerDrag || event.pointerId !== markerDrag.id) return;
    const dx = event.clientX - markerDrag.x;
    const dy = event.clientY - markerDrag.y;
    if (!markerMoved && Math.hypot(dx, dy) < 8) return;
    markerMoved = true;
    const size = markerButton.offsetWidth;
    const left = Math.min(Math.max(0, markerDrag.left + dx), innerWidth - size);
    const top = Math.min(Math.max(0, markerDrag.top + dy), innerHeight - size);
    Object.assign(markerButton.style, { left:`${left}px`, top:`${top}px`, right:"auto", bottom:"auto" });
    updateMarkerTone();
  }

  // A dragged marker keeps pixel coordinates; pull it back on screen after a
  // rotation or resize so the reviewer can always get back to the note.
  function clampMarker() {
    if (!markerButton.style.left) return;
    // The pulse scales the icon up 8%, so keep a few pixels of room at each edge.
    const size = (markerButton.offsetWidth || 48) + 4;
    const left = Math.min(Math.max(4, parseFloat(markerButton.style.left) || 0), Math.max(4, innerWidth - size));
    const top = Math.min(Math.max(4, parseFloat(markerButton.style.top) || 0), Math.max(4, innerHeight - size));
    Object.assign(markerButton.style, { left:`${left}px`, top:`${top}px` });
  }

  let markerToneFrame = 0;
  function scheduleMarkerTone() {
    if (!aside || markerToneFrame) return;
    markerToneFrame = requestAnimationFrame(() => { markerToneFrame = 0; updateMarkerTone(); });
  }

  // Blending inverts the icon against painted elements, but WebKit does not blend
  // with the page canvas (the background a site sets on html or body). Over the
  // canvas the marker switches to a solid icon chosen for contrast with it.
  function updateMarkerTone() {
    if (!aside) return;
    const rect = markerButton.getBoundingClientRect();
    const stack = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      .filter((element) => element !== host && element !== markerHost);
    const painted = stack.find((element) => {
      const styles = getComputedStyle(element);
      return parseAlpha(styles.backgroundColor) > 0 || styles.backgroundImage !== "none";
    });
    const html = document.documentElement;
    const onCanvas = !painted || painted === html || (painted === document.body && parseAlpha(getComputedStyle(html).backgroundColor) === 0);
    if (!onCanvas) {
      markerHost.style.mixBlendMode = "difference";
      markerButton.dataset.tone = "invert";
      return;
    }
    const canvasColor = painted ? getComputedStyle(painted).backgroundColor : "";
    const color = parseAlpha(canvasColor || "transparent") > 0 ? canvasColor : "rgb(255, 255, 255)";
    markerHost.style.mixBlendMode = "normal";
    markerButton.dataset.tone = relativeLuminance(color) > 0.4 ? "dark" : "light";
  }

  // Computed colours may be oklch(), color(srgb …), or rgb(); painting one pixel
  // lets the browser convert any of them to sRGB.
  let colorProbe = null;
  function toRgba(color) {
    if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return [0, 0, 0, 0];
    if (!colorProbe) colorProbe = Object.assign(document.createElement("canvas"), { width:1, height:1 }).getContext("2d", { willReadFrequently:true });
    colorProbe.clearRect(0, 0, 1, 1);
    colorProbe.fillStyle = "#fff";
    colorProbe.fillStyle = color;
    colorProbe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorProbe.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  }

  function parseAlpha(color) {
    return toRgba(color)[3];
  }

  function relativeLuminance(color) {
    const [r, g, b] = toRgba(color).slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Keeps bottom sheets above the on-screen keyboard. iOS and Android shrink the
  // visual viewport rather than the layout viewport that fixed elements use.
  function updateViewportInsets() {
    const vv = window.visualViewport;
    const keyboard = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    qa.style.setProperty("--qa-keyboard", `${keyboard}px`);
    qa.style.setProperty("--qa-visible-height", `${Math.round(vv.height)}px`);
  }

  function highlightedElement() {
    if (state.selecting) return state.hovered;
    if (!pendingTarget?.isConnected) return null;
    if (aside) return aside === "reference" ? pendingTarget : null;
    if (sheetLayout.matches && notePanel.classList.contains("open")) return pendingTarget;
    return null;
  }

  function syncHighlight() {
    const element = highlightedElement();
    if (isElementVisible(element)) drawOutline(element);
    else outline.style.display = "none";
  }

  function interceptPageEvent(event) {
    event.stopImmediatePropagation();
    if (event.type === "pointerup" && (event.pointerType === "touch" || event.pointerType === "pen")) {
      selectCandidate(event);
      return;
    }
    // touchstart and pointerdown keep their defaults so the page can still scroll.
    if (event.type === "pointerdown" || event.type === "touchstart") return;
    if (event.cancelable) event.preventDefault();
    if (event.type !== "click") return;
    // A touch tap was already handled on pointerup; ignore its compatibility click.
    if (performance.now() - lastTouchSelectionAt < 800) return;
    openNoteFor(captureSelection(event, event.target));
  }

  function handlePointerMove(event) {
    if (!state.selecting || candidate || event.pointerType === "touch" || host.contains(event.target)) return;
    state.hovered = event.target;
    drawOutline(event.target);
  }

  // Context is recorded at selection time so a note stays complete even if the
  // selected element (an open menu, for example) closes before the note is saved.
  function captureSelection(event, target) {
    const click = captureClickContext(event, target);
    return { target, click, context:captureElement(target, click), viewport:captureViewport(), mayClose:looksCloseable(target) };
  }

  const CLOSEABLE_ROLES = new Set(["menu", "listbox", "dialog", "alertdialog", "tooltip"]);
  const CLOSEABLE_CLASS = /dropdown|drawer|popover|popup|modal|flyout|offcanvas|mega-?menu|sub-?menu|accordion|collapse/i;

  // A prediction, not a guarantee: sites that do not mark up their menus are missed,
  // which is why the selected element is also watched while the note is written.
  function looksCloseable(element) {
    for (let node = element; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      if (node.matches("details[open], dialog[open]")) return true;
      if (CLOSEABLE_ROLES.has(node.getAttribute("role"))) return true;
      if (node.id && document.querySelector(`[aria-controls~="${CSS.escape(node.id)}"][aria-expanded="true"]`)) return true;
      const position = getComputedStyle(node).position;
      if (CLOSEABLE_CLASS.test(`${node.id} ${node.getAttribute("class") || ""}`) && (position === "fixed" || position === "absolute" || node.matches("[aria-expanded], [aria-hidden], .show, .open, .is-open, .active, .expanded"))) return true;
    }
    return false;
  }

  function isElementVisible(element) {
    if (!element?.isConnected) return false;
    if (typeof element.checkVisibility === "function" && !element.checkVisibility({ opacityProperty:true, visibilityProperty:true })) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function watchPendingTarget() {
    stopWatchingTarget();
    targetWatch = setInterval(() => {
      const closed = !isElementVisible(pendingTarget);
      const message = $("[data-target-closed]");
      if (message.hidden === !closed) return;
      message.textContent = closed
        ? isTouchPrimary()
          ? "What you selected has closed or is no longer visible. Your note is still attached to it. To show it open, tap Take screenshot and follow the steps."
          : "What you selected has closed or is no longer visible. Your note is still attached to it. To show it open, reopen it on the page, then take or attach a screenshot."
        : "";
      message.hidden = !closed;
      syncHighlight();
    }, 400);
  }

  function stopWatchingTarget() {
    clearInterval(targetWatch);
    targetWatch = null;
    $("[data-target-closed]").hidden = true;
  }

  function selectCandidate(event) {
    lastTouchSelectionAt = performance.now();
    candidate = { ...captureSelection(event, event.target), viaTouch:true };
    $("[data-bar-tip]").hidden = !candidate.mayClose;
    state.hovered = candidate.target;
    drawOutline(candidate.target);
    $("[data-target-label]").textContent = `Selected: ${describeElement(candidate.target)}`;
    $(".toast").classList.remove("show");
    targetBar.classList.add("show");
  }

  function clearCandidate() {
    candidate = null;
    state.hovered = null;
    outline.style.display = "none";
    targetBar.classList.remove("show");
  }

  function chooseDifferentArea() {
    clearCandidate();
    toast("Tap another area");
  }

  function confirmCandidate() {
    if (!candidate) return;
    openNoteFor(candidate);
  }

  function openNoteFor(selection) {
    pendingTarget = selection.target;
    pendingClick = selection.click;
    pendingContext = selection.context;
    pendingViewport = selection.viewport;
    editingNoteId = null;
    toggleSelection(false);
    setNoteEditorMode(false);
    renderPendingTarget();
    $("[data-note-tip]").hidden = !selection.mayClose || Boolean(selection.viaTouch);
    watchPendingTarget();
    $("#note-text").value = "";
    clearPendingScreenshot();
    renderScreenshotControls();
    openPanel("note");
    $("#note-text").focus();
  }

  async function saveNote() {
    const text = $("#note-text").value.trim();
    if (!text || (!editingNoteId && !pendingTarget)) {
      toast("Write a note first");
      return;
    }
    if (editingNoteId) {
      const note = state.notes.find((item) => item.id === editingNoteId);
      if (!note) { closeNote(); toast("That note is no longer available"); return; }
      const previousAssetIds = new Set(note.assets || []);
      note.kind = root.querySelector('input[name="kind"]:checked')?.value || "note";
      note.text = text;
      note.updatedAt = new Date().toISOString();
      if (!pendingScreenshot?.existing) {
        state.assets = state.assets.filter((asset) => !previousAssetIds.has(asset.id));
        note.assets = [];
        if (pendingScreenshot) {
          const asset = { id:makeId("asset"), kind:"reviewer-screenshot", path:`assets/${note.id}.webp`, mime:"image/webp", width:pendingScreenshot.width, height:pendingScreenshot.height, bytes:pendingScreenshot.bytes };
          state.assets.push(asset);
          note.assets.push(asset.id);
        }
      }
      persistSession();
      void syncDraftNote(structuredClone(note));
      resetNoteEditor();
      updatePins();
      openPanel(null);
      toast("Note updated");
      return;
    }
    const id = makeId("note");
    const context = pendingContext || captureElement(pendingTarget, pendingClick);
    const note = {
      id,
      sequence: state.notes.length + 1,
      createdAt: new Date().toISOString(),
      kind: root.querySelector('input[name="kind"]:checked')?.value || "note",
      text,
      page: capturePage(),
      target: context,
      viewport: pendingViewport || captureViewport(),
      diagnostics: {
        consoleErrors: state.errors.slice(-20),
        failedRequests: state.failedRequests.slice(-20),
      },
      assets: [],
    };
    if (pendingScreenshot) {
      const asset = { id:makeId("asset"), kind:"reviewer-screenshot", path:`assets/${id}.webp`, mime:"image/webp", width:pendingScreenshot.width, height:pendingScreenshot.height, bytes:pendingScreenshot.bytes };
      state.assets.push(asset);
      note.assets.push(asset.id);
    }
    state.notes.push(note);
    persistSession();
    void syncDraftNote(structuredClone(note));
    resetNoteEditor();
    updatePins();
    openPanel(null);
    toast(atIntegrationNoteLimit() ? `${INTEGRATION_NOTE_LIMIT} / ${INTEGRATION_NOTE_LIMIT} notes — submit this QA pass to keep going` : "Note saved");
  }

  function closeNote() {
    resetNoteEditor();
    openPanel(null);
  }

  function reselectTarget() {
    resetNoteEditor();
    openPanel(null);
    toggleSelection(true);
    toast("Choose a more specific element");
  }

  async function prepareScreenshot(file) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast("Use a PNG, JPEG, or WebP image"); return; }
    if (file.size > 5 * 1024 * 1024) { toast("Screenshot must be 5 MB or smaller"); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      let blob = await canvasBlob(canvas, .84);
      if (blob.size > 2 * 1024 * 1024) blob = await canvasBlob(canvas, .62);
      if (blob.size > 2 * 1024 * 1024) throw new Error("Screenshot remains larger than 2 MB after processing");
      const editedAssetIds = new Set(state.notes.find((note) => note.id === editingNoteId)?.assets || []);
      const existingBytes = state.assets.reduce((total, asset) => total + (editedAssetIds.has(asset.id) ? 0 : asset.bytes.length), 0);
      if (existingBytes + blob.size > 3 * 1024 * 1024) throw new Error("This review has reached its screenshot allowance");
      clearPendingScreenshot();
      const previewUrl = URL.createObjectURL(blob);
      pendingScreenshot = { bytes:new Uint8Array(await blob.arrayBuffer()), width, height, previewUrl };
      $(".screenshot-preview img").src = previewUrl;
      $("[data-screenshot-meta]").textContent = `${width} × ${height} · ${Math.ceil(blob.size / 1024)} KB`;
      $(".screenshot-preview").classList.add("show");
      toast("Screenshot attached");
    } catch (error) { toast(safeString(error)); }
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not process screenshot")), "image/webp", quality));
  }

  function clearPendingScreenshot() {
    if (pendingScreenshot?.previewUrl) URL.revokeObjectURL(pendingScreenshot.previewUrl);
    pendingScreenshot = null;
    $("#note-screenshot").value = "";
    $(".screenshot-preview").classList.remove("show");
    $(".screenshot-preview img").removeAttribute("src");
    $("[data-screenshot-meta]").textContent = "";
  }

  function resetNoteEditor() {
    pendingTarget = null;
    pendingClick = null;
    pendingContext = null;
    pendingViewport = null;
    editingNoteId = null;
    clearPendingScreenshot();
    renderScreenshotControls();
    stopWatchingTarget();
    $("[data-note-tip]").hidden = true;
    $(".target-warning").classList.remove("show");
    setNoteEditorMode(false);
  }

  function setNoteEditorMode(editing, sequence) {
    $(".panel.note h2").textContent = editing ? `Edit note #${sequence}` : "Add note";
    $("[data-action=save-note]").textContent = editing ? "Save changes" : "Save note";
    $("[data-action=reselect]").hidden = editing;
  }

  function editNote(noteId) {
    const note = state.notes.find((item) => item.id === noteId);
    if (!note) { toast("That note is no longer available"); return; }
    resetNoteEditor();
    editingNoteId = note.id;
    setNoteEditorMode(true, note.sequence);
    $(".target").textContent = `${note.target?.tag || "element"} · ${note.target?.selector || "saved target"}`;
    $("#note-text").value = note.text || "";
    const kind = root.querySelector(`input[name="kind"][value="${CSS.escape(note.kind || "note")}"]`) || root.querySelector('input[name="kind"][value="note"]');
    if (kind) kind.checked = true;
    const asset = state.assets.find((item) => (note.assets || []).includes(item.id));
    if (asset?.bytes) {
      const blob = new Blob([asset.bytes], { type:asset.mime || "image/webp" });
      const previewUrl = URL.createObjectURL(blob);
      pendingScreenshot = { bytes:asset.bytes, width:asset.width, height:asset.height, previewUrl, assetId:asset.id, existing:true };
      $(".screenshot-preview img").src = previewUrl;
      $("[data-screenshot-meta]").textContent = `${asset.width || "?"} × ${asset.height || "?"} · ${Math.ceil(asset.bytes.length / 1024)} KB`;
      $(".screenshot-preview").classList.add("show");
    }
    openPanel("note");
    $("#note-text").focus();
  }

  function captureElement(element, clickContext) {
    const rect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const attributes = {};
    for (const attr of element.attributes || []) {
      if (/^(value|checked|selected|srcdoc)$/i.test(attr.name) || /^on/i.test(attr.name)) continue;
      attributes[attr.name] = truncate(safeAttributeValue(attr.name, attr.value), 300);
    }
    return {
      selector: cssSelector(element),
      xpath: xpath(element),
      tag: element.tagName.toLowerCase(),
      attributes,
      text: truncate((element.innerText || element.textContent || "").trim(), 500),
      html: sanitizeHtml(element),
      rect: {
        viewport: roundRect(rect),
        document: roundRect({ x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }),
      },
      styles: pickStyles(styles),
      anchor: nearestAnchor(element),
      interaction: clickContext,
      ancestors: Array.from(ancestors(element, 5)).map((node) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: Array.from(node.classList).slice(0, 10),
      })),
    };
  }

  function nearestAnchor(element) {
    let distance = 0;
    for (let node = element; node?.nodeType === 1; node = node.parentElement) {
      const value = node.id || (node.tagName === "A" ? node.getAttribute("name") : "");
      if (value) {
        const url = new URL(cleanUrl(location.href));
        url.hash = value;
        return { url: url.href, value, relationship: distance === 0 ? "exact" : "ancestor", distance, precision: distance === 0 ? "exact" : distance <= 2 ? "near" : "section" };
      }
      distance += 1;
    }
    return { url: cleanUrl(location.href), value: null, relationship: "page", distance: null, precision: "page" };
  }

  function capturePage() {
    return {
      url: cleanUrl(location.href),
      origin: location.origin,
      path: location.pathname,
      title: document.title,
      language: document.documentElement.lang || null,
      referrerOrigin: originOnly(document.referrer),
      context: installationContext,
    };
  }

  function captureViewport() {
    return {
      width: innerWidth,
      height: innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: devicePixelRatio,
      scrollX: Math.round(scrollX),
      scrollY: Math.round(scrollY),
      colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }

  function persistSession() {
    try {
      sessionStorage.setItem(IDENTITY_KEY, JSON.stringify({
        id: state.id,
        startedAt: state.startedAt,
        reviewer: state.reviewer,
      }));
    } catch (error) {
      console.warn("QAWELL could not persist reviewer identity.", error);
    }
    try {
      const assets = state.assets.map((asset) => ({
        ...asset,
        bytes: bytesToBase64(asset.bytes),
      }));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        id: state.id,
        startedAt: state.startedAt,
        reviewer: state.reviewer,
        notes: state.notes,
        assets,
        widgetPlacement: state.widgetPlacement,
      }));
      clearMatchingLegacySession();
    } catch (error) {
      console.warn("QAWELL could not persist this review across navigation.", error);
      toast("Saved, but cross-page storage is full");
    }
  }

  function restoreSession() {
    try {
      state.widgetCompact = localStorage.getItem(COMPACT_KEY) === "true";
      const useLegacy = legacySessionMatchesProject();
      const identity = JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || (useLegacy ? sessionStorage.getItem(LEGACY_IDENTITY_KEY) : "") || "null");
      if (identity) {
        state.id = identity.id || state.id;
        state.startedAt = identity.startedAt || state.startedAt;
        state.reviewer = identity.reviewer || "";
      }
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || (useLegacy ? sessionStorage.getItem(LEGACY_STORAGE_KEY) : "") || "null");
      if (!saved || !Array.isArray(saved.notes)) return;
      state.id = saved.id || state.id;
      state.startedAt = saved.startedAt || state.startedAt;
      state.reviewer = saved.reviewer || state.reviewer;
      state.notes = saved.notes;
      if (WIDGET_PLACEMENTS.includes(saved.widgetPlacement)) state.widgetPlacement = saved.widgetPlacement;
      state.assets = (saved.assets || []).map((asset) => ({
        ...asset,
        bytes: base64ToBytes(asset.bytes),
      }));
    } catch (error) {
      console.warn("QAWELL could not restore its previous session.", error);
    }
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value || "");
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function buildReview() {
    return {
      schema: SCHEMA,
      header: {
        id: state.id,
        generator: { name: "QAWELL", version: VERSION, delivery: "console-script" },
        reviewer: { name: state.reviewer || "Anonymous reviewer" },
        timing: { startedAt: state.startedAt, exportedAt: new Date().toISOString() },
        platform: {
          page: capturePage(),
          browser: browserInfo(),
          operatingSystem: navigator.platform || null,
          locale: navigator.language || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
          online: navigator.onLine,
          touchPoints: navigator.maxTouchPoints || 0,
          viewport: captureViewport(),
          project: installationContext,
        },
        privacy: {
          excluded: ["cookies", "existing-site-web-storage", "form-values", "request-headers", "request-bodies"],
        },
      },
      notes: state.notes,
      assets: state.assets.map(({ bytes, ...asset }) => asset),
    };
  }

  function buildArchive() {
    const review = buildReview();
    const files = [
      { name: "manifest.json", data: JSON.stringify({ schema: SCHEMA, generator: review.header.generator, reviewFile: "review.json" }, null, 2) },
      { name: "review.json", data: JSON.stringify(review, null, 2) },
      ...state.assets.map((asset) => ({ name: asset.path, data: asset.bytes })),
    ];
    return new Blob([makeZip(files)], { type: "application/zip" });
  }

  function canSubmitHostedReview() {
    return Boolean(hosted.reviewId && hosted.uploadToken && (!hosted.uploadExpiresAt || new Date(hosted.uploadExpiresAt) > new Date()));
  }

  async function finishReview() {
    if (!state.notes.length && !confirm("There are no notes yet. Download an empty review?")) return;
    if (hosted.reviewId && hosted.resumeToken) await syncAllDraftNotes();
    if (!canSubmitHostedReview()) {
      if (hosted.invitationToken) return reconnectHostedReview();
      if (hosted.reviewId || hosted.config?.delivery?.mode === "integration") return renderDisconnectedReview();
      return exportZip();
    }
    const integrated = hosted.config?.delivery?.mode === "integration";
    const destination = hostedDestination();
    $("[data-finish-heading]").textContent = integrated ? "Send this review?" : "Preparing your download";
    $("[data-finish-count]").textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
    $("[data-finish-destination]").textContent = integrated ? `This will create QA tickets in ${destination}. This cannot be undone from QAWELL.` : "QAWELL will validate and record this review, then download the ZIP.";
    setFinishStatus("");
    $("[data-action=recovery-download]").hidden = true;
    $("[data-action=new-pass]").hidden = true;
    $("[data-action=cancel-finish]").hidden = !integrated;
    $("[data-action=cancel-finish]").textContent = "Keep reviewing";
    $("[data-action=confirm-submit]").hidden = !integrated;
    $("[data-action=confirm-submit]").textContent = "Confirm & send";
    openPanel("finish");
    if (!integrated) await submitHostedReview();
  }

  async function reconnectHostedReview() {
    const toolbarButton = $("[data-action=export]");
    toolbarButton.disabled = true;
    toolbarButton.textContent = "Reconnecting…";
    try {
      await startHostedReview();
      toast("QA reconnected");
      return finishReview();
    } catch (error) {
      renderDisconnectedReview(safeString(error));
    } finally {
      toolbarButton.disabled = false;
      if (!canSubmitHostedReview()) toolbarButton.textContent = "Reconnect QA";
    }
  }

  async function exportZip(recovery = false) {
    const blob = buildArchive();
    downloadBlob(blob);
    toast(recovery ? "Recovery ZIP downloaded" : "ZIP downloaded");
  }

  function renderDisconnectedReview(reconnectError = "") {
    const integrated = hosted.config?.delivery?.mode === "integration";
    $("[data-finish-heading]").textContent = "Reconnect this review";
    $("[data-finish-count]").textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"} kept safely in this browser`;
    $("[data-finish-destination]").textContent = integrated ? `This project sends to ${hostedDestination()}, but its QA link authorization is missing or expired.` : "This QA review is missing its upload authorization.";
    setFinishStatus(reconnectError ? `${reconnectError}. Reopen the project’s QA link on this page and try again.` : "Reopen the project’s QA link on this page to reconnect. QAWELL will not silently switch this review to ZIP-only delivery.", "error");
    $("[data-action=recovery-download]").hidden = false;
    $("[data-action=cancel-finish]").hidden = false;
    $("[data-action=confirm-submit]").hidden = true;
    openPanel("finish");
  }

  async function submitHostedReview() {
    const blob = buildArchive();
    const integrated = hosted.config?.delivery?.mode === "integration";
    if (hosted.maxArchiveBytes && blob.size > hosted.maxArchiveBytes) {
      setFinishStatus("This review is too large to send. Download the ZIP so none of your work is lost.", "error");
      $("[data-action=recovery-download]").hidden = false;
      $("[data-action=cancel-finish]").hidden = false;
      if (!integrated) exportZip(true);
      return;
    }
    const toolbarButton = $("[data-action=export]");
    const confirmButton = $("[data-action=confirm-submit]");
    toolbarButton.disabled = true;
    confirmButton.disabled = true;
    confirmButton.textContent = integrated ? "Sending…" : "Preparing…";
    setFinishStatus(integrated ? "Packaging and securely sending your notes…" : "Checking and preparing your ZIP…");
    try {
      const response = await fetch(`${hosted.apiBase}/api/v1/reviews/${hosted.reviewId}/archive`, { method:"POST", headers:{ "Content-Type":"application/zip", Authorization:`Bearer ${hosted.uploadToken}` }, body:blob });
      if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || "QAWELL could not finish this review"); }
      if (response.headers.get("content-type")?.includes("application/zip")) {
        downloadBlob(await response.blob(), response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]);
        toast("Review recorded — ZIP downloaded");
      } else {
        const result = await response.json();
        if (result.status === "queued") {
          setFinishStatus(`QA received. ${result.notes || state.notes.length} ${result.notes === 1 ? "note is" : "notes are"} safely queued for ${hostedDestination()}. You can close this page.`, "success");
        } else if (result.deliveryNeedsAttention) {
          setFinishStatus("QA received and retained. Delivery needs owner attention; you do not need to submit it again.", "error");
        } else {
          const ticketCount = result.tickets || result.notes || state.notes.length;
          const attachmentSummary = result.attachmentsDelivered ? ` ${result.attachmentsDelivered} ${result.attachmentsDelivered === 1 ? "screenshot was" : "screenshots were"} attached.` : "";
          const attachmentWarning = result.attachmentsFailed ? ` ${result.attachmentsFailed} ${result.attachmentsFailed === 1 ? "screenshot could" : "screenshots could"} not be attached; the text ${result.attachmentsFailed === 1 ? "ticket is" : "tickets are"} still available.` : "";
          setFinishStatus(`${ticketCount} QA ${ticketCount === 1 ? "ticket was" : "tickets were"} sent successfully.${attachmentSummary}${attachmentWarning}`, result.attachmentsFailed ? "error" : "success");
        }
      }
      hosted.uploadToken = null;
      hosted.uploadExpiresAt = null;
      hosted.resumeToken = null;
      hosted.submitted = true;
      sessionStorage.removeItem(HOSTED_KEY);
      localStorage.removeItem(HOSTED_RECOVERY_KEY);
      toolbarButton.textContent = integrated ? "Sent" : "Downloaded";
      if (!integrated) openPanel(null);
      else {
        confirmButton.hidden = true;
        $("[data-action=cancel-finish]").textContent = "Close";
        await startFreshHostedPass({ preserveFinish:true });
      }
    } catch (error) {
      setFinishStatus(`${safeString(error)}. Your notes are still here; download a recovery ZIP before leaving this page.`, "error");
      $("[data-action=recovery-download]").hidden = false;
      $("[data-action=cancel-finish]").hidden = false;
      $("[data-action=cancel-finish]").textContent = "Keep reviewing";
      confirmButton.hidden = true;
      toast("Could not send QA");
    } finally {
      toolbarButton.disabled = hosted.submitted;
      confirmButton.disabled = hosted.submitted;
      if (!hosted.submitted && !integrated) toolbarButton.textContent = "Download ZIP";
    }
  }

  function resetSubmittedPassState() {
    state.id = makeId("review");
    state.startedAt = new Date().toISOString();
    state.notes = [];
    state.assets = [];
    state.errors = [];
    state.failedRequests = [];
    sessionStorage.removeItem(STORAGE_KEY);
    persistSession();
    toggleSelection(false);
    updatePins();
  }

  async function startFreshHostedPass(options = {}) {
    const preserveFinish = Boolean(options.preserveFinish);
    const button = $("[data-action=new-pass]");
    button.disabled = true;
    button.textContent = "Starting…";
    const submittedReviewId = hosted.reviewId;
    hosted.reviewId = null;
    hosted.resumeToken = null;
    hosted.uploadToken = null;
    hosted.uploadExpiresAt = null;
    hosted.draftRevision = 0;
    try {
      const freshReview = await startHostedReview();
      if (freshReview.resumed || freshReview.reviewId === submittedReviewId || freshReview.draftRevision !== 0) {
        throw new Error("QAWELL could not verify an empty fresh QA pass");
      }
      resetSubmittedPassState();
      hosted.submitted = false;
      persistHostedSession();
      const toolbarButton = $("[data-action=export]");
      toolbarButton.disabled = false;
      toolbarButton.textContent = "Send QA";
      const confirmButton = $("[data-action=confirm-submit]");
      confirmButton.hidden = false;
      confirmButton.disabled = false;
      button.hidden = true;
      if (!preserveFinish) openPanel(null);
      toggleSelection(false);
      toast(preserveFinish ? "Sent — fresh QA pass ready" : "Fresh QA pass ready");
    } catch (error) {
      hosted.submitted = true;
      if (!preserveFinish) setFinishStatus(`${safeString(error)}. Reopen the project’s QA link and try again.`, "error");
      button.disabled = false;
      button.hidden = false;
      button.textContent = "Try another QA pass again";
    }
  }

  function setFinishStatus(message, kind = "") {
    const status = $("[data-finish-status]");
    status.textContent = message;
    status.className = `finish-status${kind ? ` ${kind}` : ""}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `qa-review-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function loadHostedConfig() {
    if (!hosted.projectKey) { renderHostedIdentity(); return; }
    try {
      const response = await fetch(`${hosted.apiBase}/api/widget/config?project=${encodeURIComponent(hosted.projectKey)}&origin=${encodeURIComponent(location.origin)}`);
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || "Project or site origin not verified");
      }
      hosted.config = await response.json();
      Object.assign(installationContext, { organization: hosted.config.organization, projectName: hosted.config.project, environment: hosted.config.environment, delivery: hosted.config.delivery?.provider || "ZIP download" });
    } catch (error) { hosted.config = { project:"Unverified project", organization:"QAWELL", environment:safeString(error), delivery:{ mode:"download", provider:null, destination:null }, error:safeString(error) }; }
    if (hosted.invitationToken) persistHostedSession();
    renderHostedIdentity();
    updatePins();
    if (hosted.newInvitation && state.reviewer) renderInvitationSwitch();
    else if (hosted.invitationToken && !hosted.reviewId && !state.reviewer) await showUnsubmittedSessions();
  }

  async function startHostedReview(options = {}) {
    const response = await fetch(`${hosted.apiBase}/api/v1/reviews`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({
      projectKey:hosted.projectKey,
      invitationToken:hosted.invitationToken,
      origin:location.origin,
      reviewerName:state.reviewer,
      resumeReviewId:hosted.reviewId || undefined,
      resumeToken:hosted.resumeToken || undefined,
      recoverByName:Boolean(options.recoverByName),
      recoverReviewId:options.recoverReviewId || undefined,
    }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not start hosted review");
    hosted.reviewId = result.reviewId;
    hosted.resumeToken = result.resumeToken || hosted.resumeToken;
    hosted.uploadToken = result.uploadToken;
    hosted.uploadExpiresAt = result.uploadExpiresAt || null;
    hosted.maxArchiveBytes = result.maxArchiveBytes;
    hosted.invitedReviewerName = result.reviewerName || null;
    hosted.draftRevision = result.draftRevision || 0;
    hosted.config = result.config;
    hosted.newInvitation = false;
    persistHostedSession();
    renderHostedIdentity();
    if (result.resumed && options.hydrate !== false) await hydrateHostedDraft();
    return result;
  }

  function persistHostedSession() {
    const saved = { projectKey:hosted.projectKey, invitationToken:hosted.invitationToken, newInvitation:hosted.newInvitation, reviewId:hosted.reviewId, resumeToken:hosted.resumeToken, uploadToken:hosted.uploadToken, uploadExpiresAt:hosted.uploadExpiresAt, maxArchiveBytes:hosted.maxArchiveBytes, invitedReviewerName:hosted.invitedReviewerName, draftRevision:hosted.draftRevision, config:hosted.config };
    try { sessionStorage.setItem(HOSTED_KEY, JSON.stringify(saved)); }
    catch (error) { console.warn("QAWELL could not persist the hosted session.", error); }
    try {
      if (hosted.reviewId && hosted.resumeToken && !hosted.submitted) localStorage.setItem(HOSTED_RECOVERY_KEY, JSON.stringify(saved));
      else localStorage.removeItem(HOSTED_RECOVERY_KEY);
    } catch (error) { console.warn("QAWELL could not create hosted review recovery state.", error); }
  }

  function restoreHostedSession() {
    try {
      const sessionSaved = sessionStorage.getItem(HOSTED_KEY) || sessionStorage.getItem(LEGACY_HOSTED_KEY);
      const recoverySaved = !sessionSaved ? localStorage.getItem(HOSTED_RECOVERY_KEY) : null;
      const saved = JSON.parse(sessionSaved || recoverySaved || "null");
      if (!saved || saved.projectKey !== hosted.projectKey) {
        hosted.newInvitation = Boolean(incomingInvitationToken);
        return;
      }
      if (incomingInvitationToken && incomingInvitationToken !== saved.invitationToken) {
        hosted.newInvitation = true;
        hosted.config = saved.config || null;
        return;
      }
      hosted.invitationToken ||= saved.invitationToken || "";
      hosted.newInvitation = Boolean(saved.newInvitation);
      hosted.reviewId = saved.reviewId || null;
      hosted.resumeToken = saved.resumeToken || null;
      hosted.uploadToken = saved.uploadToken || null;
      hosted.uploadExpiresAt = saved.uploadExpiresAt || null;
      if (hosted.uploadExpiresAt && new Date(hosted.uploadExpiresAt) <= new Date()) hosted.uploadToken = null;
      hosted.maxArchiveBytes = saved.maxArchiveBytes || 0;
      hosted.invitedReviewerName = saved.invitedReviewerName || null;
      hosted.draftRevision = saved.draftRevision || 0;
      hosted.config = saved.config || null;
    } catch (error) { console.warn("QAWELL could not restore the hosted session.", error); }
  }

  async function reconnectDraftSession() {
    if (!hosted.reviewId || !hosted.resumeToken || !hosted.invitationToken) return;
    setSyncStatus("syncing", "Reconnecting…");
    try {
      const result = await startHostedReview();
      setSyncStatus("saved", result.resumed ? "Draft restored" : "Saved to QAWell");
      toolbar.hidden = false;
      openPanel(null);
    } catch (error) {
      console.warn("QAWELL could not reconnect the saved review.", error);
      setSyncStatus("waiting", "Reconnect needed");
    }
  }

  async function upgradeLocalSession() {
    setSyncStatus("syncing", "Saving this review…");
    try {
      await startHostedReview({ recoverByName:true });
      await syncAllDraftNotes();
      setSyncStatus("saved", "Saved to QAWell");
    } catch (error) {
      console.warn("QAWELL could not move this local review into durable storage yet.", error);
      setSyncStatus("waiting", "Sync needs retry");
    }
  }

  async function hydrateHostedDraft() {
    if (!hosted.reviewId || !hosted.resumeToken) return;
    const response = await fetch(`${hosted.apiBase}/api/v1/reviews/${hosted.reviewId}/draft`, { headers:{ Authorization:`Bearer ${hosted.resumeToken}` } });
    const draft = await response.json();
    if (!response.ok) throw new Error(draft.error || "Could not restore the saved review");
    hosted.draftRevision = draft.revision || 0;
    if (draft.reviewerName) state.reviewer = draft.reviewerName;

    const localNotes = new Map(state.notes.map((note) => [note.id, note]));
    for (const serverNote of draft.notes || []) {
      const local = localNotes.get(serverNote.id);
      const localTime = new Date(local?.updatedAt || local?.createdAt || 0).getTime();
      const serverTime = new Date(serverNote.updatedAt || serverNote.createdAt || 0).getTime();
      if (!local || serverTime > localTime) localNotes.set(serverNote.id, serverNote);
    }
    state.notes = Array.from(localNotes.values()).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    const localAssets = new Map(state.assets.map((asset) => [asset.id, asset]));
    const referencedAssets = new Map((draft.assets || []).map((asset) => [asset.asset_id, asset]));
    for (const note of state.notes) {
      for (const assetId of note.assets || []) {
        if (localAssets.has(assetId) || !referencedAssets.has(assetId)) continue;
        const assetResponse = await fetch(`${hosted.apiBase}/api/v1/reviews/${hosted.reviewId}/draft/assets/${encodeURIComponent(assetId)}`, { headers:{ Authorization:`Bearer ${hosted.resumeToken}` } });
        if (!assetResponse.ok) continue;
        const blob = await assetResponse.blob();
        const bitmap = await createImageBitmap(blob).catch(() => null);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        localAssets.set(assetId, { id:assetId, kind:"reviewer-screenshot", path:`assets/${note.id}.${extensionForMime(blob.type)}`, mime:blob.type || "image/webp", width:bitmap?.width || null, height:bitmap?.height || null, bytes });
        bitmap?.close?.();
      }
    }
    state.assets = Array.from(localAssets.values()).filter((asset) => state.notes.some((note) => (note.assets || []).includes(asset.id)));
    persistSession();
    persistHostedSession();
    updatePins();
    $(`#reviewer`).value = state.reviewer;
    if (state.notes.length) toast(`${state.notes.length} saved ${state.notes.length === 1 ? "note" : "notes"} restored`);
    await syncAllDraftNotes();
  }

  const draftSyncs = new Map();

  async function syncDraftNote(note) {
    if (!hosted.reviewId || !hosted.resumeToken || hosted.submitted) {
      setSyncStatus("local", "Saved locally");
      return false;
    }
    const previous = draftSyncs.get(note.id) || Promise.resolve();
    const task = previous.catch(() => false).then(() => performDraftNoteSync(note));
    draftSyncs.set(note.id, task);
    try { return await task; }
    finally { if (draftSyncs.get(note.id) === task) draftSyncs.delete(note.id); }
  }

  async function performDraftNoteSync(note) {
    setSyncStatus("syncing", "Syncing…");
    try {
      for (const assetId of note.assets || []) {
        const asset = state.assets.find((item) => item.id === assetId);
        if (!asset?.bytes) throw new Error("Screenshot data is unavailable");
        const assetResponse = await fetch(`${hosted.apiBase}/api/v1/reviews/${hosted.reviewId}/draft/assets/${encodeURIComponent(asset.id)}`, {
          method:"PUT",
          headers:{ Authorization:`Bearer ${hosted.resumeToken}`, "Content-Type":asset.mime || "image/webp", "X-QAWELL-File-Name":encodeURIComponent(asset.path.split("/").pop() || `${asset.id}.webp`) },
          body:asset.bytes,
        });
        if (!assetResponse.ok) { const failure = await assetResponse.json().catch(() => ({})); throw new Error(failure.error || "Could not save screenshot"); }
      }
      const response = await fetch(`${hosted.apiBase}/api/v1/reviews/${hosted.reviewId}/draft`, {
        method:"PUT",
        headers:{ Authorization:`Bearer ${hosted.resumeToken}`, "Content-Type":"application/json" },
        body:JSON.stringify({ note, reviewerName:state.reviewer }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save note");
      hosted.draftRevision = result.revision || hosted.draftRevision;
      persistHostedSession();
      setSyncStatus("saved", "Saved to QAWell");
      return true;
    } catch (error) {
      console.warn("QAWELL draft sync is waiting.", error);
      setSyncStatus("waiting", navigator.onLine ? "Sync needs retry" : "Waiting for connection");
      return false;
    }
  }

  async function syncAllDraftNotes() {
    if (!hosted.reviewId || !hosted.resumeToken || hosted.submitted) return;
    for (const note of state.notes) await syncDraftNote(note);
  }

  async function syncReviewerName() {
    if (!hosted.reviewId || !hosted.resumeToken) return;
    const response = await fetch(`${hosted.apiBase}/api/v1/reviews/${hosted.reviewId}/draft`, { method:"PATCH", headers:{ Authorization:`Bearer ${hosted.resumeToken}`, "Content-Type":"application/json" }, body:JSON.stringify({ reviewerName:state.reviewer }) });
    if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || "Could not save reviewer name"); }
    setSyncStatus("saved", "Saved to QAWell");
  }

  function setSyncStatus(stateName, message) {
    root.querySelectorAll("[data-sync-status]").forEach((node) => { node.dataset.state = stateName; node.textContent = message; });
  }

  function extensionForMime(mime) {
    return mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  }

  function legacySessionMatchesProject() {
    try { return JSON.parse(sessionStorage.getItem(LEGACY_HOSTED_KEY) || "null")?.projectKey === hosted.projectKey; }
    catch (_) { return false; }
  }

  function clearMatchingLegacySession() {
    if (!legacySessionMatchesProject()) return;
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_IDENTITY_KEY);
    sessionStorage.removeItem(LEGACY_HOSTED_KEY);
  }

  function renderHostedIdentity() {
    const config = hosted.config;
    const project = config?.project || installationContext.project || "Local review";
    const owner = config ? `For ${config.organization}` : "No hosted project";
    const environment = config?.environment ? `Reviewing the ${config.environment} site.` : "";
    const destination = hostedDestination();
    const invited = Boolean(hosted.invitationToken);
    const delivery = invited && config?.delivery?.mode === "integration"
      ? hosted.reviewId ? `When you finish, your notes will be sent to ${destination}. Each QA pass holds up to ${INTEGRATION_NOTE_LIMIT} notes; submit it and start another if needed.` : `This QA link will send your notes to ${destination}. Each QA pass holds up to ${INTEGRATION_NOTE_LIMIT} notes.`
      : config?.delivery?.mode === "integration"
        ? `QA link authorization is needed to send notes to ${destination}. Reopen the project’s QA link to reconnect.`
        : "When you finish, your notes will download as a ZIP.";
    root.querySelectorAll("[data-identity-project],[data-info-project]").forEach((node) => { node.textContent = project; });
    root.querySelectorAll("[data-identity-owner],[data-info-owner]").forEach((node) => { node.textContent = owner; });
    root.querySelectorAll("[data-identity-environment],[data-info-environment]").forEach((node) => { node.textContent = environment; });
    root.querySelectorAll("[data-identity-delivery],[data-info-delivery]").forEach((node) => { node.textContent = delivery; });
    const exportButton = $("[data-action=export]");
    if (exportButton && !hosted.submitted) exportButton.textContent = config?.delivery?.mode === "integration" ? canSubmitHostedReview() ? "Send QA" : "Reconnect QA" : "Download ZIP";
  }

  function hostedDestination() {
    const delivery = hosted.config?.delivery;
    const provider = delivery?.provider === "agency_brain" ? "Agency Brain" : delivery?.provider === "sifter" ? "Sifter" : delivery?.provider;
    return provider ? `${provider}${delivery.destination ? ` / ${delivery.destination}` : ""}` : "the configured integration";
  }

  function readInvitationToken() {
    const match = location.hash.match(/(?:^#|[&#])qa-invite=([^&]+)/);
    if (!match) return "";
    const token = decodeURIComponent(match[1]);
    const cleaned = location.hash.replace(/([#&])qa-invite=[^&]*&?/, "$1").replace(/^#&?$/, "");
    history.replaceState(history.state, "", `${location.pathname}${location.search}${cleaned}`);
    return token;
  }

  function updatePins() {
    const pins = $(".pins");
    pins.textContent = "";
    for (const note of state.notes) {
      if (note.page.url !== cleanUrl(location.href)) continue;
      const pin = document.createElement("button");
      pin.className = "pin";
      pin.title = note.text;
      pin.setAttribute("aria-label", `Note ${note.sequence}: ${note.text}`);
      pin.dataset.action = "view-note";
      pin.dataset.noteId = note.id;
      const icon = document.createElement("img");
      icon.src = "https://qawell.dev/icon.png";
      icon.alt = "";
      const number = document.createElement("span");
      number.textContent = note.sequence;
      pin.append(icon, number);
      pin.style.left = `${note.target.rect.document.x - scrollX}px`;
      pin.style.top = `${note.target.rect.document.y - scrollY}px`;
      pins.appendChild(pin);
    }
    $(".count").textContent = hosted.config?.delivery?.mode === "integration" ? `${state.notes.length} / ${INTEGRATION_NOTE_LIMIT} notes` : `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
    $("[data-mobile-count]").textContent = state.notes.length ? `${state.notes.length} saved ${state.notes.length === 1 ? "note" : "notes"}` : "No notes yet";
  }

  function atIntegrationNoteLimit() {
    return hosted.config?.delivery?.mode === "integration" && state.notes.length >= INTEGRATION_NOTE_LIMIT;
  }

  function renderNotesPanel(focusId = null) {
    const list = $(".note-list");
    list.textContent = "";
    if (!state.notes.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No notes have been saved yet.";
      list.appendChild(empty);
    }
    for (const note of state.notes) {
      const item = document.createElement("article");
      item.className = `note-list-item${note.id === focusId ? " focused" : ""}`;
      item.dataset.noteId = note.id;
      const meta = document.createElement("span");
      meta.className = "note-list-meta";
      const sequence = document.createElement("span");
      sequence.textContent = `#${note.sequence} · ${note.kind}`;
      const viewport = document.createElement("span");
      viewport.textContent = `${note.viewport?.width ?? "?"}×${note.viewport?.height ?? "?"}`;
      meta.append(sequence, viewport);
      const text = document.createElement("span");
      text.className = "note-list-text";
      text.textContent = note.text;
      const page = document.createElement("span");
      page.className = "note-list-page";
      page.textContent = note.page?.path || note.page?.url || "Unknown page";
      const actions = document.createElement("div");
      actions.className = "note-list-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "note-list-edit";
      edit.dataset.action = "edit-note";
      edit.textContent = "Edit note";
      actions.appendChild(edit);
      item.append(meta, text, page, actions);
      list.appendChild(item);
    }
    openPanel("review-notes");
    if (focusId) list.querySelector(`[data-note-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function refreshOverlay() {
    syncHighlight();
    if (aside) { clampMarker(); scheduleMarkerTone(); }
    if (state.notes.length) updatePins();
  }

  function renderPendingTarget() {
    const rect = pendingContext?.rect?.viewport || pendingTarget.getBoundingClientRect();
    $(".target").textContent = `${describeElement(pendingTarget)} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    const viewportArea = Math.max(1, innerWidth * innerHeight);
    const selectedArea = Math.max(0, rect.width * rect.height);
    const isLarge = selectedArea / viewportArea >= 0.4 || rect.width >= innerWidth * 0.9 && rect.height >= innerHeight * 0.3;
    $(".target-warning").classList.toggle("show", isLarge);
  }

  function captureClickContext(event, selectedElement) {
    const rect = selectedElement.getBoundingClientRect();
    const clientX = Math.round(event.clientX);
    const clientY = Math.round(event.clientY);
    const hitElements = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(event.clientX, event.clientY).filter((element) => element !== host && !host.contains(element))
      : [selectedElement];

    return {
      pointer: {
        viewport: { x: clientX, y: clientY },
        document: { x: Math.round(event.clientX + scrollX), y: Math.round(event.clientY + scrollY) },
        relativeToTarget: {
          x: Math.round(event.clientX - rect.left),
          y: Math.round(event.clientY - rect.top),
          xRatio: roundRatio(event.clientX - rect.left, rect.width),
          yRatio: roundRatio(event.clientY - rect.top, rect.height),
        },
      },
      deepestElement: summarizeElement(hitElements[0] || selectedElement),
      hitStack: uniqueElements(hitElements).slice(0, 8).map(summarizeElement),
      nearbyDescendants: nearestDescendants(selectedElement, event.clientX, event.clientY),
    };
  }

  function nearestDescendants(element, x, y) {
    const candidates = Array.from(element.querySelectorAll("*")).slice(0, 2000)
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        return { node, distance: Math.round(Math.hypot(dx, dy)), area: rect.width * rect.height };
      })
      .sort((a, b) => a.distance - b.distance || a.area - b.area);

    return uniqueElements(candidates.map(({ node }) => node)).slice(0, 5).map((node) => {
      const summary = summarizeElement(node);
      const rect = node.getBoundingClientRect();
      const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      return { ...summary, distanceFromClick: Math.round(Math.hypot(dx, dy)) };
    });
  }

  function summarizeElement(element) {
    const rect = element.getBoundingClientRect();
    return {
      selector: cssSelector(element),
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList).slice(0, 8),
      text: truncate((element.innerText || element.textContent || "").trim(), 160),
      rect: roundRect(rect),
    };
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements));
  }

  function roundRatio(value, total) {
    if (!total) return null;
    return Math.round(Math.max(0, Math.min(1, value / total)) * 1000) / 1000;
  }

  function drawOutline(element) {
    const rect = element.getBoundingClientRect();
    Object.assign(outline.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  function openPanel(name) {
    if (name !== "note") stopWatchingTarget();
    for (const panel of root.querySelectorAll(".panel")) panel.classList.remove("open");
    if (name) $(`.panel.${name}`)?.classList.add("open");
    qa.dataset.sheet = String(Boolean(name) && name !== "mobile-well");
    syncHighlight();
    $("[data-action=well]").setAttribute("aria-expanded", name === "mobile-well" ? "true" : "false");
  }

  function openWell() {
    openPanel($(".panel.mobile-well").classList.contains("open") ? null : "mobile-well");
  }

  function toggleCompactMode() {
    state.widgetCompact = !state.widgetCompact;
    try { localStorage.setItem(COMPACT_KEY, String(state.widgetCompact)); }
    catch (error) { console.warn("QAWELL could not remember the widget size.", error); }
    updateWidgetMode();
    openPanel(null);
    toast(state.widgetCompact ? "Widget minimized" : "Widget expanded");
  }

  function updateWidgetMode() {
    $(".qa").dataset.compact = String(state.widgetCompact);
    $("[data-action=toggle-compact]").textContent = state.widgetCompact ? "Expand widget" : "Minimize widget";
  }

  function syncMobileExport() {
    const labels = {
      "Export ZIP":"Finish and download",
      "Download ZIP":"Finish and download",
      "Send QA":"Finish and send",
    };
    mobileExport.textContent = labels[toolbarExport.textContent] || toolbarExport.textContent;
    mobileExport.disabled = toolbarExport.disabled;
  }

  // On phones the dock can be dragged anywhere. Its position is stored as a
  // fraction of the usable area so it survives rotation and resizing. The Move
  // the well control remains the keyboard alternative and returns it to a corner.
  let dockPosition = readDockPosition();
  let dockDrag = null;
  let dockMoved = false;

  function readDockPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(DOCK_KEY) || "null");
      return Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? { x:clamp01(saved.x), y:clamp01(saved.y) } : null;
    } catch { return null; }
  }

  function saveDockPosition() {
    try {
      if (dockPosition) localStorage.setItem(DOCK_KEY, JSON.stringify(dockPosition));
      else localStorage.removeItem(DOCK_KEY);
    } catch (error) { console.warn("QAWELL could not remember the widget position.", error); }
  }

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function dockBounds(rect) {
    const probe = getComputedStyle($(".safe-area-probe"));
    const inset = (side) => parseFloat(probe[`padding${side}`]) || 0;
    const margin = 8;
    const minX = inset("Left") + margin;
    const minY = inset("Top") + margin;
    return { minX, minY, maxX:Math.max(minX, innerWidth - inset("Right") - margin - rect.width), maxY:Math.max(minY, innerHeight - inset("Bottom") - margin - rect.height) };
  }

  function handleDockPointer(event) {
    if (event.type === "pointerup") {
      if (dockDrag && dockMoved) finishDockDrag();
      dockDrag = null;
      return;
    }
    const origin = event.composedPath()[0];
    if (!(origin instanceof Element) || !origin.closest(".toolbar")) return;
    dockMoved = false;
    if (!sheetLayout.matches || event.pointerType === "mouse") return;
    const rect = toolbar.getBoundingClientRect();
    dockDrag = { id:event.pointerId, x:event.clientX, y:event.clientY, left:rect.left, top:rect.top };
  }

  function finishDockDrag() {
    const nearest = `${dockPosition.y > .5 ? "bottom" : "top"}-${dockPosition.x > .5 ? "right" : "left"}`;
    if (nearest !== state.widgetPlacement) {
      state.widgetPlacement = nearest;
      updateWidgetPlacement();
      persistSession();
    }
    saveDockPosition();
  }

  function dragDock(event) {
    if (!dockDrag || event.pointerId !== dockDrag.id) return;
    const dx = event.clientX - dockDrag.x;
    const dy = event.clientY - dockDrag.y;
    if (!dockMoved) {
      if (Math.hypot(dx, dy) < 8) return;
      dockMoved = true;
      toolbar.setPointerCapture?.(event.pointerId);
      openPanel(null);
    }
    const rect = toolbar.getBoundingClientRect();
    const bounds = dockBounds(rect);
    const left = Math.min(Math.max(bounds.minX, dockDrag.left + dx), bounds.maxX);
    const top = Math.min(Math.max(bounds.minY, dockDrag.top + dy), bounds.maxY);
    dockPosition = {
      x:bounds.maxX > bounds.minX ? (left - bounds.minX) / (bounds.maxX - bounds.minX) : 0,
      y:bounds.maxY > bounds.minY ? (top - bounds.minY) / (bounds.maxY - bounds.minY) : 0,
    };
    applyDockPosition();
  }

  function applyDockPosition() {
    const well = $(".panel.mobile-well");
    const reset = { left:"", top:"", right:"", bottom:"" };
    const rect = toolbar.getBoundingClientRect();
    if (!dockPosition || !sheetLayout.matches || !rect.width) {
      Object.assign(toolbar.style, reset);
      Object.assign(well.style, reset);
      return;
    }
    const bounds = dockBounds(rect);
    const left = bounds.minX + dockPosition.x * (bounds.maxX - bounds.minX);
    const top = bounds.minY + dockPosition.y * (bounds.maxY - bounds.minY);
    Object.assign(toolbar.style, { left:`${left}px`, top:`${top}px`, right:"auto", bottom:"auto" });
    // Keep the review controls menu attached to the dock wherever it sits.
    const below = top + rect.height / 2 < innerHeight / 2;
    const alignRight = left + rect.width / 2 > innerWidth / 2;
    Object.assign(well.style, {
      top:below ? `${top + rect.height + 8}px` : "auto",
      bottom:below ? "auto" : `${innerHeight - top + 8}px`,
      left:alignRight ? "auto" : `${left}px`,
      right:alignRight ? `${innerWidth - left - rect.width}px` : "auto",
    });
  }

  function moveWidget() {
    dockPosition = null;
    saveDockPosition();
    applyDockPosition();
    const currentIndex = WIDGET_PLACEMENTS.indexOf(state.widgetPlacement);
    state.widgetPlacement = WIDGET_PLACEMENTS[(currentIndex + 1) % WIDGET_PLACEMENTS.length];
    updateWidgetPlacement();
    persistSession();
    toast(`Widget moved to ${state.widgetPlacement.replace("-", " ")}`);
  }

  function updateWidgetPlacement() {
    $(".qa").dataset.placement = state.widgetPlacement;
    const nextIndex = (WIDGET_PLACEMENTS.indexOf(state.widgetPlacement) + 1) % WIDGET_PLACEMENTS.length;
    const nextPlacement = WIDGET_PLACEMENTS[nextIndex].replace("-", " ");
    const directionIcons = { "bottom-right":"←", "bottom-left":"↑", "top-left":"→", "top-right":"↓" };
    const moveButton = $("[data-action=move-widget]");
    $(".move-widget-icon").textContent = directionIcons[state.widgetPlacement];
    moveButton.title = `Move widget to ${nextPlacement}`;
    moveButton.setAttribute("aria-label", moveButton.title);
  }

  function toast(message) {
    const node = $(".toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 1800);
  }

  function destroy() {
    toggleSelection(false);
    stopWatchingTarget();
    for (const fn of cleanup.reverse()) fn();
    host.remove();
    delete window[GLOBAL_KEY];
    console.info("QAWELL removed. Page instrumentation restored.");
  }

  function resetSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(IDENTITY_KEY);
    sessionStorage.removeItem(HOSTED_KEY);
    localStorage.removeItem(HOSTED_RECOVERY_KEY);
    clearMatchingLegacySession();
    state.id = makeId("review");
    state.startedAt = new Date().toISOString();
    state.reviewer = "";
    state.notes = [];
    state.assets = [];
    hosted.reviewId = null;
    hosted.resumeToken = null;
    hosted.uploadToken = null;
    hosted.uploadExpiresAt = null;
    hosted.draftRevision = 0;
    hosted.submitted = false;
    updatePins();
    toolbar.hidden = true;
    $("#reviewer").value = "";
    openPanel("setup");
  }

  function instrumentFetch() {
    if (!window.fetch) return;
    const original = window.fetch;
    window.fetch = async function (...args) {
      const started = performance.now();
      try {
        const response = await original.apply(this, args);
        if (!response.ok) recordFailedRequest(args[0], args[1]?.method, response.status, performance.now() - started);
        return response;
      } catch (error) {
        recordFailedRequest(args[0], args[1]?.method, null, performance.now() - started, error);
        throw error;
      }
    };
    cleanup.push(() => { window.fetch = original; });
  }

  function instrumentXHR() {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__qaRequest = { method, url, started: 0 };
      return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (this.__qaRequest) this.__qaRequest.started = performance.now();
      this.addEventListener("loadend", () => {
        if (this.status === 0 || this.status >= 400) recordFailedRequest(this.__qaRequest?.url, this.__qaRequest?.method, this.status || null, performance.now() - (this.__qaRequest?.started || performance.now()));
      }, { once: true });
      return send.apply(this, args);
    };
    cleanup.push(() => { XMLHttpRequest.prototype.open = open; XMLHttpRequest.prototype.send = send; });
  }

  function recordFailedRequest(input, method = "GET", status = null, duration = null, error = null) {
    const rawUrl = typeof input === "string" ? input : input?.url;
    state.failedRequests.push({ method: method || input?.method || "GET", url: cleanUrl(rawUrl), status, durationMs: Math.round(duration || 0), error: error ? safeString(error) : null, at: new Date().toISOString() });
    trimDiagnostics();
  }

  function trimDiagnostics() {
    state.errors = state.errors.slice(-50);
    state.failedRequests = state.failedRequests.slice(-50);
  }

  function browserInfo() {
    const ua = navigator.userAgent;
    const match = ua.match(/Edg\/([\d.]+)/) || ua.match(/OPR\/([\d.]+)/) || ua.match(/Firefox\/([\d.]+)/) || ua.match(/Chrome\/([\d.]+)/) || ua.match(/Version\/([\d.]+).*Safari/);
    const token = match?.[0] || "";
    const name = token.startsWith("Edg/") ? "Edge" : token.startsWith("OPR/") ? "Opera" : token.startsWith("Firefox/") ? "Firefox" : token.startsWith("Chrome/") ? "Chrome" : token.includes("Safari") ? "Safari" : "Unknown";
    return { name, version: match?.[1] || null, userAgent: ua };
  }

  function captureInstallationContext(script) {
    const allowedKeys = ["project", "environment", "build", "commit", "deployment", "cmsId", "template"];
    const result = {};
    const globalContext = window.QA_CAPTURE_CONTEXT;
    if (globalContext && typeof globalContext === "object" && !Array.isArray(globalContext)) {
      for (const key of allowedKeys) {
        if (["string", "number", "boolean"].includes(typeof globalContext[key])) result[key] = truncate(globalContext[key], 300);
      }
    }

    const dataMap = {
      project: "project",
      qaProject: "project",
      qaEnvironment: "environment",
      qaBuild: "build",
      qaCommit: "commit",
      qaDeployment: "deployment",
      qaCmsId: "cmsId",
      qaTemplate: "template",
    };
    for (const [dataKey, contextKey] of Object.entries(dataMap)) {
      if (script?.dataset?.[dataKey]) result[contextKey] = truncate(script.dataset[dataKey], 300);
    }

    const metaMap = {
      "qa:project": "project",
      "qa:environment": "environment",
      "qa:build": "build",
      "qa:commit": "commit",
      "qa:deployment": "deployment",
      "qa:cms-id": "cmsId",
      "qa:template": "template",
    };
    for (const [metaName, contextKey] of Object.entries(metaMap)) {
      const content = document.querySelector(`meta[name="${metaName}"]`)?.content;
      if (content) result[contextKey] = truncate(content, 300);
    }
    return result;
  }

  function sanitizeHtml(element) {
    const clone = element.cloneNode(true);
    removeSensitiveContent(clone);
    for (const node of [clone, ...clone.querySelectorAll("*")]) {
      for (const attr of Array.from(node.attributes || [])) {
        if (/^on/i.test(attr.name) || /^(value|checked|selected|srcdoc)$/i.test(attr.name)) node.removeAttribute(attr.name);
        else node.setAttribute(attr.name, safeAttributeValue(attr.name, attr.value));
      }
    }
    clone.querySelectorAll("script,style,noscript").forEach((node) => node.remove());
    return truncate(clone.outerHTML, 3000);
  }

  function removeSensitiveContent(rootNode) {
    for (const node of [rootNode, ...rootNode.querySelectorAll("input,textarea,select")]) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) {
        node.removeAttribute("value");
        if (node.tagName === "TEXTAREA") node.textContent = "";
        if (node.tagName === "SELECT") node.querySelectorAll("option").forEach((option) => option.removeAttribute("selected"));
      }
    }
  }

  function pickStyles(styles) {
    const names = ["display", "position", "color", "background-color", "font-family", "font-size", "font-weight", "line-height", "text-align", "border", "border-radius", "padding", "margin", "width", "height", "opacity", "visibility", "overflow"];
    return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(name)]));
  }

  function cssSelector(element) {
    if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) return `#${CSS.escape(element.id)}`;
    const parts = [];
    for (let node = element; node?.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      const stableClasses = Array.from(node.classList).filter((name) => !/^(active|focus|hover|selected|open|is-|has-)/.test(name)).slice(0, 2);
      if (stableClasses.length) part += stableClasses.map((name) => `.${CSS.escape(name)}`).join("");
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter((sibling) => sibling.tagName === node.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      const candidate = parts.join(" > ");
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch (_) {}
      if (parts.length >= 6) break;
    }
    return parts.join(" > ");
  }

  function xpath(element) {
    const parts = [];
    for (let node = element; node?.nodeType === 1; node = node.parentElement) {
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter((sibling) => sibling.tagName === node.tagName) : [];
      parts.unshift(`${node.tagName.toLowerCase()}${siblings.length > 1 ? `[${siblings.indexOf(node) + 1}]` : ""}`);
    }
    return `/${parts.join("/")}`;
  }

  function* ancestors(element, limit) {
    let node = element.parentElement;
    while (node && limit-- > 0) { yield node; node = node.parentElement; }
  }

  function describeElement(element) {
    const text = truncate((element.innerText || element.textContent || "").trim(), 80);
    return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${text ? ` — ${text}` : ""}`;
  }

  function cleanUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      url.username = ""; url.password = ""; url.hash = "";
      for (const key of Array.from(url.searchParams.keys())) {
        if (/(token|secret|password|passwd|auth|session|signature|api[-_]?key|access[-_]?key)/i.test(key)) url.searchParams.set(key, "[REDACTED]");
      }
      return url.href;
    } catch (_) { return truncate(String(value), 1000); }
  }

  function safeAttributeValue(name, value) {
    return /^(href|src|action|formaction|poster)$/i.test(name) ? cleanUrl(value) : value;
  }

  function originOnly(value) {
    try { return value ? new URL(value).origin : null; } catch (_) { return null; }
  }

  function roundRect(rect) {
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  function safeString(value) {
    try { return value instanceof Error ? `${value.name}: ${value.message}` : String(value); } catch (_) { return "Unknown error"; }
  }

  function truncate(value, length) {
    const text = String(value || "");
    return text.length > length ? `${text.slice(0, length)}…` : text;
  }

  function makeId(prefix) {
    return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  }

  function on(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    cleanup.push(() => target.removeEventListener(type, listener, options));
  }

  // Small, dependency-free ZIP writer using uncompressed entries.
  function makeZip(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      const crc = crc32(data);
      const local = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
      const central = concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
      locals.push(local); centrals.push(central); offset += local.length;
    }
    const directory = concat(centrals);
    const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(directory.length), u32(offset), u16(0)]);
    return concat([...locals, directory, end]);
  }

  function concat(parts) {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  function u16(value) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
  function u32(value) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
})();
