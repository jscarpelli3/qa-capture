export function GET() {
  return Response.json(
    { ok: true, service: "qa-capture-web", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
