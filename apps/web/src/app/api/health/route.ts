export function GET() {
  return Response.json(
    { ok: true, service: "qawell-web", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
