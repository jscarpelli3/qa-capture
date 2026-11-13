import { dispatchPendingDeliveryJobs } from "@/lib/review-delivery-queue";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error:"Unauthorized" }, { status:401 });
  }
  const result = await dispatchPendingDeliveryJobs();
  return Response.json(result);
}
