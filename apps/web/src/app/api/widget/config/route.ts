import { diagnoseWidgetProject, widgetConfig } from "@/lib/widget-project";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectKey = url.searchParams.get("project") || "";
  const origin = url.searchParams.get("origin") || request.headers.get("origin") || "";
  try {
    const result = await diagnoseWidgetProject(projectKey, origin);
    const record = result.record;
    if (!record) return json({ error: result.error || "Project or verified origin not found." }, 404, origin);
    return json(widgetConfig(record), 200, record.origin);
  } catch { return json({ error: "Invalid project request." }, 400, origin); }
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request.headers.get("origin") || "*") });
}

function json(body: unknown, status: number, origin: string) { return Response.json(body, { status, headers: cors(origin) }); }
function cors(origin: string) { return { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin", "Cache-Control": "no-store" }; }
