(() => {
  "use strict";

  const VERSION = "0.1.0";
  const SCHEMA = "qa-review/1";
  const GLOBAL_KEY = "__qaCapture";
  const STORAGE_KEY = "__qaCaptureSession_v1";

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
      .qa { color:#f5f1e8; font:13px/1.45 ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace; }
      button, input, textarea, select { font:inherit; }
      button { cursor:pointer; }
      .toolbar { position:fixed;right:18px;bottom:18px;display:flex;gap:7px;align-items:center;padding:7px;background:#080808;border:1px solid #f5f1e8;border-radius:3px;box-shadow:6px 6px 0 #f5f1e8;pointer-events:auto; }
      .toolbar button { border:1px solid #f5f1e8;border-radius:2px;padding:8px 11px;background:#f5f1e8;color:#080808;font-weight:700;text-transform:uppercase;letter-spacing:.03em; }
      .toolbar button:hover { background:#fff; }
      .toolbar button.primary { background:#080808;color:#f5f1e8; }
      .toolbar button.active { background:#f5f1e8;color:#080808; }
      .count { color:#fff;padding:0 5px;white-space:nowrap; }
      .outline { display:none;position:fixed;border:2px solid #ff4d00;background:#ff4d001a;pointer-events:none; }
      .panel { display:none;position:fixed;right:18px;bottom:76px;width:min(380px,calc(100vw - 36px));max-height:calc(100vh - 100px);overflow:auto;padding:18px;background:#080808;border:1px solid #f5f1e8;border-radius:3px;box-shadow:7px 7px 0 #f5f1e8;pointer-events:auto; }
      .panel.open { display:block; }
      h2 { margin:0 0 14px;font-size:15px;text-transform:uppercase;letter-spacing:.08em; }
      label { display:block;margin:12px 0 6px;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.06em; }
      input, textarea { width:100%;border:1px solid #f5f1e8;border-radius:2px;padding:10px;color:#f5f1e8;background:#111;outline:none; }
      input:focus, textarea:focus { border-color:#ff4d00;box-shadow:0 0 0 1px #ff4d00; }
      textarea { min-height:96px;resize:vertical; }
      .actions { display:flex;justify-content:flex-end;gap:8px;margin-top:14px; }
      .actions button { border:1px solid #f5f1e8;border-radius:2px;padding:8px 11px;background:#080808;color:#f5f1e8;text-transform:uppercase;font-weight:700;font-size:11px; }
      .actions .primary { background:#f5f1e8;color:#080808; }
      .hint { margin:8px 0 0;color:#aaa;font-size:11px; }
      .target { padding:9px;background:#181818;border:1px solid #444;border-radius:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px; }
      .types { display:flex;flex-wrap:wrap;gap:6px; }
      .type-pill { position:relative; }
      .type-pill input { position:absolute;opacity:0;pointer-events:none; }
      .type-pill span { display:block;padding:6px 9px;border:1px solid #777;border-radius:999px;color:#bbb;cursor:pointer;text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:.05em; }
      .type-pill input:checked + span { background:#f5f1e8;border-color:#f5f1e8;color:#080808; }
      .type-pill input:focus-visible + span { outline:2px solid #ff4d00;outline-offset:2px; }
      .pins { position:fixed;inset:0;pointer-events:none; }
      .pin { position:absolute;width:25px;height:25px;border:1px solid #f5f1e8;border-radius:50%;background:#080808;color:#f5f1e8;box-shadow:2px 2px 0 #f5f1e8;font:bold 11px/21px ui-monospace;text-align:center;pointer-events:auto; }
      .toast { display:none;position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:9px 13px;border:1px solid #f5f1e8;border-radius:2px;background:#080808;color:#f5f1e8;box-shadow:4px 4px 0 #f5f1e8; }
      .toast.show { display:block; }
    </style>
    <div class="qa">
      <div class="pins"></div>
      <div class="outline"></div>
      <section class="panel setup open" aria-label="QA Capture setup">
        <h2>Start a QA review</h2>
        <label for="reviewer">Your name</label>
        <input id="reviewer" autocomplete="name" placeholder="Jane Reviewer">
        <p class="hint">Stored only in the review data you download.</p>
        <div class="actions"><button class="primary" data-action="start">Start review</button></div>
      </section>
      <section class="panel note" aria-label="Add QA note">
        <h2>Add note</h2>
        <div class="target"></div>
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
        <div class="actions"><button data-action="cancel-note">Cancel</button><button class="primary" data-action="save-note">Save note</button></div>
      </section>
      <section class="panel info" aria-label="QA Capture information">
        <h2>QA Capture</h2>
        <p>This tool records your notes and ordinary page context. It does not read cookies, existing site storage, form values, request bodies, or request headers.</p>
        <div class="actions"><button data-action="close-info">Close</button><button data-action="destroy">Remove tool</button></div>
      </section>
      <div class="toolbar" hidden>
        <button data-action="select" class="primary">＋ Add note</button>
        <span class="count">0 notes</span>
        <button data-action="info" aria-label="About QA Capture">?</button>
        <button data-action="export">Export ZIP</button>
      </div>
      <div class="toast" role="status"></div>
    </div>`;

  const $ = (selector) => root.querySelector(selector);
  const toolbar = $(".toolbar");
  const outline = $(".outline");
  const notePanel = $(".panel.note");
  let pendingTarget = null;

  on(root, "click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "start") startReview();
    if (action === "select") toggleSelection();
    if (action === "cancel-note") closeNote();
    if (action === "save-note") await saveNote();
    if (action === "export") await exportZip();
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

  if (state.reviewer) {
    $("#reviewer").value = state.reviewer;
    toolbar.hidden = false;
    openPanel(null);
    updatePins();
    toggleSelection(true);
    toast("Review restored — select an element");
  }

  function startReview() {
    state.reviewer = $("#reviewer").value.trim() || "Anonymous reviewer";
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
    toggleSelection(false);
    $(".target").textContent = describeElement(pendingTarget);
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
    const context = captureElement(pendingTarget);
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
    updatePins();
    openPanel(null);
    toast("Note saved");
  }

  function closeNote() {
    pendingTarget = null;
    openPanel(null);
  }

  function captureElement(element) {
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
      console.warn("QA Capture could not persist this review across navigation.", error);
      toast("Saved, but cross-page storage is full");
    }
  }

  function restoreSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || !Array.isArray(saved.notes)) return;
      state.id = saved.id || state.id;
      state.startedAt = saved.startedAt || state.startedAt;
      state.reviewer = saved.reviewer || "";
      state.notes = saved.notes;
      state.assets = (saved.assets || []).map((asset) => ({
        ...asset,
        bytes: base64ToBytes(asset.bytes),
      }));
    } catch (error) {
      console.warn("QA Capture could not restore its previous session.", error);
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
        generator: { name: "QA Capture", version: VERSION, delivery: "console-script" },
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
        },
        privacy: {
          excluded: ["cookies", "existing-site-web-storage", "form-values", "request-headers", "request-bodies"],
        },
      },
      notes: state.notes,
      assets: state.assets.map(({ bytes, ...asset }) => asset),
    };
  }

  async function exportZip() {
    if (!state.notes.length && !confirm("There are no notes yet. Export an empty review?")) return;
    const review = buildReview();
    const files = [
      { name: "manifest.json", data: JSON.stringify({ schema: SCHEMA, generator: review.header.generator, reviewFile: "review.json" }, null, 2) },
      { name: "review.json", data: JSON.stringify(review, null, 2) },
      ...state.assets.map((asset) => ({ name: asset.path, data: asset.bytes })),
    ];
    const blob = new Blob([makeZip(files)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qa-review-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast("ZIP downloaded");
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
      pin.style.left = `${note.target.rect.document.x - scrollX}px`;
      pin.style.top = `${note.target.rect.document.y - scrollY}px`;
      pins.appendChild(pin);
    }
    $(".count").textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
  }

  function refreshOverlay() {
    if (state.selecting && state.hovered?.isConnected) drawOutline(state.hovered);
    if (state.notes.length) updatePins();
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
    console.info("QA Capture removed. Page instrumentation restored.");
  }

  function resetSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    state.id = makeId("review");
    state.startedAt = new Date().toISOString();
    state.reviewer = "";
    state.notes = [];
    state.assets = [];
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
