import "server-only";
import { z } from "zod";

const agencyBrainProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  client: z.unknown().optional(),
  project_pm: z.unknown().optional(),
  open_tickets: z.number().optional(),
  total_tickets: z.number().optional(),
}).passthrough();

const projectResponseSchema = z.union([
  z.array(agencyBrainProjectSchema),
  z.object({ projects: z.array(agencyBrainProjectSchema) }),
]);

export type AgencyBrainProject = z.infer<typeof agencyBrainProjectSchema>;

export async function fetchAgencyBrainProjects(apiKey: string): Promise<AgencyBrainProject[]> {
  const response = await fetch("https://theagencybrain.com/api/external/qa/projects", {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (response.status === 401) throw new Error("Agency Brain rejected this API key.");
  if (response.status === 403) throw new Error("This key needs both qa:read and qa:create scopes.");
  if (!response.ok) throw new Error(`Agency Brain returned ${response.status}. Try again shortly.`);

  const parsed = projectResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Agency Brain returned an unexpected projects response.");
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.projects;
}
