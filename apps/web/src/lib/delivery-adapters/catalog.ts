import type { IntegrationProvider } from "./types";

export const integrationCatalog: Record<IntegrationProvider, { label: string; noun: string; availability: "available" | "planned" }> = {
  agency_brain: { label: "Agency Brain", noun: "QA ticket", availability: "available" },
  sifter: { label: "Sifter", noun: "issue", availability: "planned" },
  asana: { label: "Asana", noun: "task", availability: "planned" },
};

export function integrationLabel(provider?: string | null) {
  return provider && provider in integrationCatalog ? integrationCatalog[provider as IntegrationProvider].label : provider || "Integration";
}
