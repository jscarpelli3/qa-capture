(() => {
  "use strict";

  const VERSION = "0.3.0";
  const SCHEMA = "qa-review/1";
  const GLOBAL_KEY = "__qaCapture";
  const STORAGE_KEY = "__qaCaptureSession_v1";
  const IDENTITY_KEY = "__qaCaptureIdentity_v1";
  const HOSTED_KEY = "__qawellHostedSession_v1";
  const sourceScript = document.currentScript;
  const installationContext = captureInstallationContext(sourceScript);
  const hosted = {
    apiBase: sourceScript?.src ? new URL(sourceScript.src).origin : "https://qawell.dev",
    projectKey: sourceScript?.dataset?.project || sourceScript?.dataset?.qaProject || "",
    invitationToken: readInvitationToken(),
    config: null,
    reviewId: null,
    uploadToken: null,
    maxArchiveBytes: 0,
    submitted: false,
  };
  restoreHostedSession();
  if (hosted.invitationToken) persistHostedSession();

  if (window[GLOBAL_KEY]) {
    window[GLOBAL_KEY].addNote();
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
      .toolbar { position:fixed;right:18px;bottom:18px;display:flex;gap:0;align-items:center;padding:0;background:#e7e4da;border:1px solid #282b27;border-radius:0;box-shadow:7px 7px 0 #666b45;pointer-events:auto; }
      .toolbar button { min-height:42px;border:0;border-right:1px solid #282b27;border-radius:0;padding:8px 11px;background:#e7e4da;color:#282b27;font-weight:800;text-transform:uppercase;letter-spacing:.02em; }
      .toolbar button:last-child { border-right:0; }
      .toolbar button:hover { background:#d8d5ca; }
      .toolbar button.primary { background:#282b27;color:#e7e4da; }
      .toolbar button.active { background:#a84f2f;color:#e7e4da; }
      .toolbar .count { background:transparent;color:#282b27;padding:8px 10px;white-space:nowrap;text-transform:none;letter-spacing:0;font-weight:600; }
      .toolbar .count:hover { background:#d8d5ca;color:#282b27; }
      .well-mark { width:38px;padding:3px!important;background:#d8d5ca!important; }
      .well-mark img { display:block;width:31px;height:31px;object-fit:contain; }
      .outline { display:none;position:fixed;border:2px solid #a84f2f;background:#a84f2f1a;pointer-events:none; }
      .panel { display:none;position:fixed;right:18px;bottom:76px;width:min(400px,calc(100vw - 36px));max-height:calc(100vh - 100px);overflow:auto;padding:20px;background:#e7e4da;color:#282b27;border:1px solid #282b27;border-radius:0;box-shadow:9px 9px 0 #666b45;pointer-events:auto; }
      .panel.open { display:block; }
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
      .finish-summary { padding:12px;border:1px solid #282b27;background:#d8d5ca; }
      .finish-summary strong,.finish-summary span { display:block; }
      .finish-summary span { margin-top:6px;font:12px/1.45 ui-sans-serif,system-ui,sans-serif; }
      .finish-status { min-height:18px;margin:10px 0 0;font:12px/1.45 ui-sans-serif,system-ui,sans-serif; }
      .finish-status.error { padding:9px;border:1px solid #a84f2f;background:#ead2c8;color:#7c321c; }
      .finish-status.success { color:#465225;font-weight:700; }
      button:disabled { cursor:wait;opacity:.6; }
      .pins { position:fixed;inset:0;pointer-events:none; }
      .pin { position:absolute;width:25px;height:25px;border:1px solid #e7e4da;border-radius:50%;background:#282b27;color:#e7e4da;box-shadow:2px 2px 0 #a84f2f;font:bold 11px/21px ui-monospace;text-align:center;pointer-events:auto; }
      .toast { display:none;position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:9px 13px;border:1px solid #282b27;border-radius:0;background:#e7e4da;color:#282b27;box-shadow:4px 4px 0 #666b45; }
      .toast.show { display:block; }
    </style>
    <div class="qa">
      <div class="pins"></div>
      <div class="outline"></div>
      <section class="panel setup open" aria-label="QAWELL setup">
        <h2>Start a QA review</h2>
        <div class="identity"><strong data-identity-project>Loading project…</strong><span data-identity-owner>QAWELL review utility</span><em data-identity-environment></em><em data-identity-delivery></em></div>
        <label for="reviewer">Your name</label>
        <input id="reviewer" autocomplete="name" placeholder="Bob Sacamano">
        <p class="hint">Stored only in the review data you download.</p>
        <div class="actions"><button class="primary" data-action="start">Start review</button></div>
      </section>
      <section class="panel note" aria-label="Add QA note">
        <h2>Add note</h2>
        <div class="target"></div>
        <p class="target-warning">Large area selected. That is okay, but choosing a smaller item may make the note easier to interpret.</p>
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
        <div class="actions"><button data-action="cancel-finish">Keep reviewing</button><button data-action="recovery-download" hidden>Download recovery ZIP</button><button class="primary" data-action="confirm-submit">Confirm &amp; send</button></div>
      </section>
      <div class="toolbar" hidden>
        <button class="well-mark" data-action="info" aria-label="About this QAWELL review"><img src="https://qawell.dev/icon.png" alt=""></button>
        <button data-action="select" class="primary">＋ Add note</button>
        <button data-action="list" class="count" title="View saved notes">0 notes</button>
        <button data-action="export">Export ZIP</button>
      </div>
      <div class="toast" role="status"></div>
    </div>`;

  const $ = (selector) => root.querySelector(selector);
  const toolbar = $(".toolbar");
  const outline = $(".outline");
  const notePanel = $(".panel.note");
  let pendingTarget = null;
  let pendingClick = null;

  on(root, "click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "start") startReview();
    if (action === "select") toggleSelection();
    if (action === "reselect") reselectTarget();
    if (action === "cancel-note") closeNote();
    if (action === "save-note") await saveNote();
    if (action === "export") await finishReview();
    if (action === "cancel-finish") openPanel(null);
    if (action === "confirm-submit") await submitHostedReview();
    if (action === "recovery-download") await exportZip(true);
    if (action === "list") renderNotesPanel();
    if (action === "view-note") renderNotesPanel(event.target.closest("[data-note-id]")?.dataset.noteId);
    if (action === "close-notes") openPanel(null);
    if (action === "info") openPanel("info");
    if (action === "close-info") openPanel(null);
    if (action === "destroy") destroy();
  });

  on(document, "pointermove", handlePointerMove, true);
  on(document, "click", handlePageClick, true);
  on(window, "scroll", refreshOverlay, true);
  on(window, "resize", refreshOverlay);
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
    export: exportZip,
    destroy,
    reset: resetSession,
    getData: buildReview,
  };

  updatePins();
  loadHostedConfig();

  if (state.reviewer) {
    $("#reviewer").value = state.reviewer;
    toolbar.hidden = false;
    openPanel(null);
    updatePins();
    toggleSelection(true);
    toast("Review restored — select an element");
  }

  async function startReview() {
    state.reviewer = $("#reviewer").value.trim() || "Anonymous reviewer";
    if (hosted.projectKey && hosted.invitationToken && !hosted.reviewId) {
      try { await startHostedReview(); }
      catch (error) { toast(safeString(error)); return; }
    }
    persistSession();
    toolbar.hidden = false;
    openPanel(null);
    toggleSelection(true);
    toast("Select an element");
  }

  function beginAddingNote() {
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
    state.selecting = typeof force === "boolean" ? force : !state.selecting;
    $("[data-action=select]").classList.toggle("active", state.selecting);
    $("[data-action=select]").textContent = state.selecting ? "Cancel selection" : "＋ Add note";
    if (!state.selecting) {
      state.hovered = null;
      outline.style.display = "none";
    }
  }

  function handlePointerMove(event) {
    if (!state.selecting || host.contains(event.target)) return;
    state.hovered = event.target;
    drawOutline(event.target);
  }

  function handlePageClick(event) {
    if (!state.selecting || host.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    pendingTarget = event.target;
    pendingClick = captureClickContext(event, pendingTarget);
    toggleSelection(false);
    renderPendingTarget();
    $("#note-text").value = "";
    openPanel("note");
    $("#note-text").focus();
  }

  async function saveNote() {
    const text = $("#note-text").value.trim();
    if (!text || !pendingTarget) {
      toast("Write a note first");
      return;
    }
    const id = makeId("note");
    const context = captureElement(pendingTarget, pendingClick);
    const note = {
      id,
      sequence: state.notes.length + 1,
      createdAt: new Date().toISOString(),
      kind: root.querySelector('input[name="kind"]:checked')?.value || "note",
      text,
      page: capturePage(),
      target: context,
      viewport: captureViewport(),
      diagnostics: {
        consoleErrors: state.errors.slice(-20),
        failedRequests: state.failedRequests.slice(-20),
      },
      assets: [],
    };
    try {
      const screenshot = await captureElementImage(pendingTarget, id);
      if (screenshot) {
        state.assets.push(screenshot);
        note.assets.push(screenshot.id);
      }
    } catch (error) {
      note.captureWarnings = [`Element image unavailable: ${safeString(error)}`];
    }
    state.notes.push(note);
    persistSession();
    pendingTarget = null;
    pendingClick = null;
    updatePins();
    openPanel(null);
    toast("Note saved");
  }

  function closeNote() {
    pendingTarget = null;
    pendingClick = null;
    $(".target-warning").classList.remove("show");
    openPanel(null);
  }

  function reselectTarget() {
    pendingTarget = null;
    pendingClick = null;
    $(".target-warning").classList.remove("show");
    openPanel(null);
    toggleSelection(true);
    toast("Choose a more specific element");
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
      interaction: clickContext,
      ancestors: Array.from(ancestors(element, 5)).map((node) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: Array.from(node.classList).slice(0, 10),
      })),
    };
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
      }));
    } catch (error) {
      console.warn("QAWELL could not persist this review across navigation.", error);
      toast("Saved, but cross-page storage is full");
    }
  }

  function restoreSession() {
    try {
      const identity = JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || "null");
      if (identity) {
        state.id = identity.id || state.id;
        state.startedAt = identity.startedAt || state.startedAt;
        state.reviewer = identity.reviewer || "";
      }
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || !Array.isArray(saved.notes)) return;
      state.id = saved.id || state.id;
      state.startedAt = saved.startedAt || state.startedAt;
      state.reviewer = saved.reviewer || state.reviewer;
      state.notes = saved.notes;
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
    return Boolean(hosted.invitationToken && hosted.reviewId && hosted.uploadToken);
  }

  async function finishReview() {
    if (!state.notes.length && !confirm("There are no notes yet. Download an empty review?")) return;
    if (!canSubmitHostedReview()) return exportZip();
    const integrated = hosted.config?.delivery?.mode === "integration";
    const destination = hostedDestination();
    $("[data-finish-heading]").textContent = integrated ? "Send this review?" : "Preparing your download";
    $("[data-finish-count]").textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
    $("[data-finish-destination]").textContent = integrated ? `This will create QA tickets in ${destination}. This cannot be undone from QAWELL.` : "QAWELL will validate and record this review, then download the ZIP.";
    setFinishStatus("");
    $("[data-action=recovery-download]").hidden = true;
    $("[data-action=cancel-finish]").hidden = !integrated;
    $("[data-action=confirm-submit]").hidden = !integrated;
    $("[data-action=confirm-submit]").textContent = "Confirm & send";
    openPanel("finish");
    if (!integrated) await submitHostedReview();
  }

  async function exportZip(recovery = false) {
    const blob = buildArchive();
    downloadBlob(blob);
    toast(recovery ? "Recovery ZIP downloaded" : "ZIP downloaded");
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
        setFinishStatus(`${result.tickets || result.notes || state.notes.length} QA ${state.notes.length === 1 ? "ticket was" : "tickets were"} sent successfully.`, "success");
      }
      hosted.uploadToken = null;
      hosted.submitted = true;
      sessionStorage.removeItem(HOSTED_KEY);
      toolbarButton.textContent = integrated ? "Sent" : "Downloaded";
      if (!integrated) openPanel(null);
      else confirmButton.textContent = "Sent";
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
  }

  async function startHostedReview() {
    const response = await fetch(`${hosted.apiBase}/api/v1/reviews`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ projectKey:hosted.projectKey, invitationToken:hosted.invitationToken, origin:location.origin }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not start hosted review");
    hosted.reviewId = result.reviewId; hosted.uploadToken = result.uploadToken; hosted.maxArchiveBytes = result.maxArchiveBytes; hosted.config = result.config;
    persistHostedSession();
    renderHostedIdentity();
  }

  function persistHostedSession() {
    try { sessionStorage.setItem(HOSTED_KEY, JSON.stringify({ projectKey:hosted.projectKey, invitationToken:hosted.invitationToken, reviewId:hosted.reviewId, uploadToken:hosted.uploadToken, maxArchiveBytes:hosted.maxArchiveBytes, config:hosted.config })); }
    catch (error) { console.warn("QAWELL could not persist the hosted session.", error); }
  }

  function restoreHostedSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HOSTED_KEY) || "null");
      if (!saved || saved.projectKey !== hosted.projectKey) return;
      hosted.invitationToken ||= saved.invitationToken || "";
      hosted.reviewId = saved.reviewId || null;
      hosted.uploadToken = saved.uploadToken || null;
      hosted.maxArchiveBytes = saved.maxArchiveBytes || 0;
      hosted.config = saved.config || null;
    } catch (error) { console.warn("QAWELL could not restore the hosted session.", error); }
  }

  function renderHostedIdentity() {
    const config = hosted.config;
    const project = config?.project || installationContext.project || "Local review";
    const owner = config ? `For ${config.organization}` : "No hosted project";
    const environment = config?.environment ? `Reviewing the ${config.environment} site.` : "";
    const destination = hostedDestination();
    const authorized = canSubmitHostedReview();
    const delivery = authorized && config?.delivery?.mode === "integration"
      ? `When you finish, your notes will be sent to ${destination}.`
      : config?.delivery?.mode === "integration"
        ? `This session will download a ZIP. Use a QAWELL invitation link to send notes to ${destination}.`
        : "When you finish, your notes will download as a ZIP.";
    root.querySelectorAll("[data-identity-project],[data-info-project]").forEach((node) => { node.textContent = project; });
    root.querySelectorAll("[data-identity-owner],[data-info-owner]").forEach((node) => { node.textContent = owner; });
    root.querySelectorAll("[data-identity-environment],[data-info-environment]").forEach((node) => { node.textContent = environment; });
    root.querySelectorAll("[data-identity-delivery],[data-info-delivery]").forEach((node) => { node.textContent = delivery; });
    const exportButton = $("[data-action=export]");
    if (exportButton && !hosted.submitted) exportButton.textContent = authorized && config?.delivery?.mode === "integration" ? "Send QA" : "Download ZIP";
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

  async function captureElementImage(element, noteId) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.width > 4000 || rect.height > 4000) return null;
    const clone = element.cloneNode(true);
    removeSensitiveContent(clone);
    const xml = new XMLSerializer().serializeToString(clone);
    const width = Math.max(1, Math.ceil(rect.width));
    const height = Math.max(1, Math.ceil(rect.height));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${xml}</div></foreignObject></svg>`;
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Browser could not render the selected element"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { id: makeId("asset"), kind: "element-image", path: `assets/${noteId}.png`, mime: "image/png", width, height, bytes };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function updatePins() {
    const pins = $(".pins");
    pins.textContent = "";
    for (const note of state.notes) {
      if (note.page.url !== cleanUrl(location.href)) continue;
      const pin = document.createElement("button");
      pin.className = "pin";
      pin.textContent = note.sequence;
      pin.title = note.text;
      pin.dataset.action = "view-note";
      pin.dataset.noteId = note.id;
      pin.style.left = `${note.target.rect.document.x - scrollX}px`;
      pin.style.top = `${note.target.rect.document.y - scrollY}px`;
      pins.appendChild(pin);
    }
    $(".count").textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
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
      item.append(meta, text, page);
      list.appendChild(item);
    }
    openPanel("review-notes");
    if (focusId) list.querySelector(`[data-note-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function refreshOverlay() {
    if (state.selecting && state.hovered?.isConnected) drawOutline(state.hovered);
    if (state.notes.length) updatePins();
  }

  function renderPendingTarget() {
    const rect = pendingTarget.getBoundingClientRect();
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
    for (const panel of root.querySelectorAll(".panel")) panel.classList.remove("open");
    if (name) $(`.panel.${name}`)?.classList.add("open");
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
    for (const fn of cleanup.reverse()) fn();
    host.remove();
    delete window[GLOBAL_KEY];
    console.info("QAWELL removed. Page instrumentation restored.");
  }

  function resetSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(IDENTITY_KEY);
    sessionStorage.removeItem(HOSTED_KEY);
    state.id = makeId("review");
    state.startedAt = new Date().toISOString();
    state.reviewer = "";
    state.notes = [];
    state.assets = [];
    hosted.reviewId = null;
    hosted.uploadToken = null;
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
