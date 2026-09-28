import { createZip } from "./zip.mjs";
import { serializableAggregate } from "./aggregate.mjs";

export function renderJson(aggregate) {
  return `${JSON.stringify(serializableAggregate(aggregate), null, 2)}\n`;
}

export function renderMarkdown(aggregate) {
  const lines = [
    "# Combined QA Review",
    "",
    `- Reviews: ${aggregate.summary.reviewCount}`,
    `- Notes: ${aggregate.summary.noteCount}`,
    `- Reviewers: ${aggregate.summary.reviewerCount}`,
    `- Pages: ${aggregate.summary.pageCount}`,
    "",
  ];
  const groups = groupBy(aggregate.notes, (note) => note.page?.path || "Unknown page");
  for (const [page, notes] of groups) {
    lines.push(`## ${escapeMarkdown(page)}`, "");
    for (const note of notes) {
      lines.push(
        `### ${note.kind.toUpperCase()} · ${escapeMarkdown(note.reviewer)} · #${note.sequence}`,
        "",
        note.text,
        "",
        `- Source: \`${note.sourceKey}\``,
        `- URL: ${note.page?.url || "Unavailable"}`,
        `- Captured: ${note.viewport?.width ?? "?"} × ${note.viewport?.height ?? "?"} CSS px · DPR ${note.viewport?.devicePixelRatio ?? "?"}`,
        `- Target: \`${escapeCode(note.target?.selector || note.target?.tag || "Unavailable")}\``,
      );
      for (const assetId of note.assets) {
        const asset = aggregate.assets.find((item) => item.id === assetId);
        if (asset) lines.push(`- Screenshot: [${asset.path}](${asset.path})`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

export function renderCsv(aggregate) {
  const rows = [["source_key", "reviewer", "created_at", "kind", "page_title", "page_path", "page_url", "note", "viewport_width", "viewport_height", "dpr", "selector", "assets"]];
  for (const note of aggregate.notes) {
    rows.push([
      note.sourceKey,
      note.reviewer,
      note.createdAt,
      note.kind,
      note.page?.title || "",
      note.page?.path || "",
      note.page?.url || "",
      note.text,
      note.viewport?.width ?? "",
      note.viewport?.height ?? "",
      note.viewport?.devicePixelRatio ?? "",
      note.target?.selector || "",
      note.assets.map((id) => aggregate.assets.find((asset) => asset.id === id)?.path).filter(Boolean).join(" "),
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function renderHtml(aggregate) {
  const data = JSON.stringify(serializableAggregate(aggregate)).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>Combined QA Review</title>
  <style>${HTML_CSS}</style>
</head>
<body>
  <header><p class="eyebrow">QA CAPTURE / AGGREGATE</p><h1>Combined review</h1><div id="summary"></div></header>
  <nav><input id="search" type="search" placeholder="Search notes, pages, reviewers…"><select id="reviewer"><option value="">All reviewers</option></select><select id="kind"><option value="">All types</option></select></nav>
  <main id="notes"></main>
  <script type="application/json" id="qa-data">${data}</script>
  <script>${HTML_JS}</script>
</body>
</html>`;
}

export function renderXlsx(aggregate) {
  const sheets = [
    { name: "Summary", rows: [["Metric", "Value"], ["Reviews", aggregate.summary.reviewCount], ["Notes", aggregate.summary.noteCount], ["Reviewers", aggregate.summary.reviewerCount], ["Pages", aggregate.summary.pageCount], ["Generated", aggregate.generatedAt]] },
    { name: "Reviews", rows: [["Review ID", "Reviewer", "Started", "Exported", "Origin", "Notes", "Source file", "SHA-256"], ...aggregate.sources.map((source) => [source.reviewId, source.reviewer, source.startedAt, source.exportedAt, source.origin || "", source.noteCount, source.sourceName, source.archiveSha256])] },
    { name: "Notes", rows: [["Source key", "Reviewer", "Created", "Type", "Page title", "Path", "URL", "Note", "Viewport width", "Viewport height", "DPR", "Selector", "Screenshots"], ...aggregate.notes.map((note) => [note.sourceKey, note.reviewer, note.createdAt, note.kind, note.page?.title || "", note.page?.path || "", note.page?.url || "", note.text, note.viewport?.width ?? "", note.viewport?.height ?? "", note.viewport?.devicePixelRatio ?? "", note.target?.selector || "", note.assets.map((id) => aggregate.assets.find((asset) => asset.id === id)?.path).filter(Boolean).join(" ")])] },
  ];
  const entries = [
    { name: "[Content_Types].xml", data: contentTypesXml(sheets.length) },
    { name: "_rels/.rels", data: rootRelsXml() },
    { name: "xl/workbook.xml", data: workbookXml(sheets) },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml(sheets.length) },
    { name: "xl/styles.xml", data: stylesXml() },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: worksheetXml(sheet.rows) })),
  ];
  return createZip(entries);
}

function worksheetXml(rows) {
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cellXml(value, columnIndex, rowIndex)).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function cellXml(value, columnIndex, rowIndex) {
  const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value ?? ""))}</t></is></c>`;
}

function columnName(index) {
  let value = index + 1;
  let output = "";
  while (value) { value -= 1; output = String.fromCharCode(65 + (value % 26)) + output; value = Math.floor(value / 26); }
  return output;
}

function contentTypesXml(count) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({ length: count }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
}

function workbookRelsXml(count) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`;
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) { const key = keyFn(item); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
  return groups;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeMarkdown(value) { return String(value).replace(/([\\`*_{}[\]()#+.!|>-])/g, "\\$1"); }
function escapeCode(value) { return String(value).replaceAll("`", "\\`"); }
function escapeXml(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }

const HTML_CSS = `:root{color-scheme:dark;font:14px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;background:#080808;color:#f5f1e8}*{box-sizing:border-box}body{margin:0}header,nav,main{max-width:1100px;margin:auto;padding:24px}header{padding-top:54px}.eyebrow{color:#ff6a2a;font-weight:700;letter-spacing:.12em}h1{font-size:clamp(32px,6vw,72px);line-height:1;margin:.2em 0}.summary{display:flex;gap:18px;flex-wrap:wrap;color:#aaa}nav{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;position:sticky;top:0;background:#080808;border-block:1px solid #444}input,select{width:100%;padding:11px;border:1px solid #eee;border-radius:2px;background:#111;color:#f5f1e8;font:inherit}.note{border:1px solid #555;margin:0 0 18px;padding:18px;box-shadow:5px 5px 0 #eee}.meta{display:flex;gap:8px;flex-wrap:wrap;color:#aaa;font-size:12px}.pill{border:1px solid #777;border-radius:999px;padding:2px 7px;text-transform:uppercase}.feedback{font:18px/1.5 ui-sans-serif,system-ui,sans-serif}.asset{max-width:100%;max-height:500px;border:1px solid #555;background:#fff}.details{margin-top:12px;border-top:1px solid #333;padding-top:10px}code{word-break:break-all;color:#ffad89}@media(max-width:700px){nav{grid-template-columns:1fr}header,nav,main{padding:16px}}@media print{nav{display:none}.note{break-inside:avoid;box-shadow:none}}`;

const HTML_JS = `(()=>{"use strict";const data=JSON.parse(document.getElementById("qa-data").textContent);const notes=document.getElementById("notes");const search=document.getElementById("search");const reviewer=document.getElementById("reviewer");const kind=document.getElementById("kind");const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};document.getElementById("summary").append(Object.assign(el("div",null,"summary"),{textContent:data.summary.reviewCount+" reviews · "+data.summary.noteCount+" notes · "+data.summary.reviewerCount+" reviewers · "+data.summary.pageCount+" pages"}));[...new Set(data.notes.map(n=>n.reviewer))].sort().forEach(v=>reviewer.add(new Option(v,v)));[...new Set(data.notes.map(n=>n.kind))].sort().forEach(v=>kind.add(new Option(v,v)));function render(){notes.textContent="";const q=search.value.toLowerCase();for(const n of data.notes){if(reviewer.value&&n.reviewer!==reviewer.value)continue;if(kind.value&&n.kind!==kind.value)continue;const hay=[n.text,n.reviewer,n.page?.path,n.page?.title,n.target?.text].join(" ").toLowerCase();if(q&&!hay.includes(q))continue;const card=el("article",null,"note");const meta=el("div",null,"meta");meta.append(el("span",n.kind,"pill"),el("span",n.reviewer),el("span",n.page?.path||"Unknown page"),el("span",(n.viewport?.width||"?")+"×"+(n.viewport?.height||"?")+" · DPR "+(n.viewport?.devicePixelRatio||"?")));card.append(meta,el("p",n.text,"feedback"));for(const id of n.assets){const a=data.assets.find(x=>x.id===id);if(a){const img=el("img",null,"asset");img.src=a.path;img.alt="Captured element for "+n.sourceKey;img.loading="lazy";card.append(img)}}const details=el("details",null,"details");details.append(el("summary","Technical context"));const code=el("code",n.target?.selector||n.target?.tag||"No selector");details.append(code);card.append(details);notes.append(card)}}search.addEventListener("input",render);reviewer.addEventListener("change",render);kind.addEventListener("change",render);render()})()`;
