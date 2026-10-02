const CAPTURE_SOURCE = "https://jscarpelli3.github.io/qa-capture/qa-capture.js";

export async function GET() {
  const upstream = await fetch(CAPTURE_SOURCE, { cache: "no-store" });
  if (!upstream.ok) return new Response("/* QAWELL capture script is temporarily unavailable. */", { status: 503 });
  return new Response(await upstream.text(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
