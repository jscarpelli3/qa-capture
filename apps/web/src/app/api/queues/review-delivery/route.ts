import { handleCallback } from "@vercel/queue";
import { DeliveryRetryError, processReviewDelivery } from "@/lib/process-review-delivery";
import type { ReviewDeliveryMessage } from "@/lib/review-delivery-queue";

export const maxDuration = 180;

export const POST = handleCallback<ReviewDeliveryMessage>(
  async (message, metadata) => processReviewDelivery(message, metadata.messageId),
  {
    visibilityTimeoutSeconds: 240,
    retry: (error, metadata) => {
      if (error instanceof DeliveryRetryError) return { afterSeconds:error.afterSeconds };
      if (metadata.deliveryCount >= 8) return { acknowledge:true };
      return { afterSeconds:Math.min(30 * 60, 2 ** metadata.deliveryCount * 5) };
    },
  },
);
