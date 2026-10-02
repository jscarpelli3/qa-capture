import type { QawellReview } from "@qa-capture/aggregate";

export type IntegrationProvider = "agency_brain" | "sifter" | "asana";

export type DeliveryOutcome = {
  mode: "integration";
  provider: IntegrationProvider;
  delivered: number;
};

export interface ReviewDeliveryAdapter {
  provider: IntegrationProvider;
  deliver(input: { reviewId: string; review: QawellReview }): Promise<DeliveryOutcome>;
}
