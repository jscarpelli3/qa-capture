import type { QawellReview, ReviewAsset } from "@qa-capture/aggregate";

export type IntegrationProvider = "agency_brain" | "sifter" | "asana";

export type DeliveryOutcome = {
  mode: "integration";
  provider: IntegrationProvider;
  delivered: number;
  attachmentsDelivered?: number;
  attachmentsFailed?: number;
};

export interface ReviewDeliveryAdapter {
  provider: IntegrationProvider;
  deliver(input: { reviewId: string; review: QawellReview; assetsById: Map<string, ReviewAsset> }): Promise<DeliveryOutcome>;
}
