import "server-only";
import type { QawellReview, ReviewAsset } from "@qa-capture/aggregate";
import { deliverReviewToAgencyBrain } from "@/lib/agency-brain-delivery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { IntegrationProvider, ReviewDeliveryAdapter } from "./types";

const adapters: Partial<Record<IntegrationProvider, ReviewDeliveryAdapter>> = {
  agency_brain: {
    provider: "agency_brain",
    async deliver({ reviewId, review, assetsById }) {
      const result = await deliverReviewToAgencyBrain(reviewId, review, assetsById);
      return { mode: "integration", provider: "agency_brain", delivered: result.delivered, attachmentsDelivered: result.attachmentsDelivered, attachmentsFailed: result.attachmentsFailed };
    },
  },
};

export async function deliverReview(reviewId: string, review: QawellReview, assetsById: Map<string, ReviewAsset>) {
  const admin = createSupabaseAdminClient();
  const { data: storedReview } = await admin.from("reviews").select("project_id").eq("id", reviewId).single();
  if (!storedReview) throw new Error("Review record not found");
  const { data: integration } = await admin.from("project_integrations").select("provider").eq("project_id", storedReview.project_id).eq("status", "active").maybeSingle();
  if (!integration) return { delivered: 0, mode: "download" as const };
  const provider = integration.provider as IntegrationProvider;
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`${provider} delivery is not available yet`);
  return adapter.deliver({ reviewId, review, assetsById });
}
