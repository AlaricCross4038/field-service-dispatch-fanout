import { createHash } from "node:crypto";
import { z } from "zod";

export const dispatchRequestSchema = z.object({
  workOrderId: z.string().min(1),
  status: z.enum(["scheduled", "dispatched", "completed"]),
  photos: z.array(z.object({
    url: z.string().url(),
    caption: z.string().min(1),
  })).max(12),
  technicianFollowUpAt: z.string().datetime(),
  subscribers: z.array(z.object({
    subscriberId: z.string().min(1),
    channel: z.enum(["sms", "email", "push"]),
    enabled: z.boolean(),
  })).min(1).max(500),
});

export type DispatchRequest = z.infer<typeof dispatchRequestSchema>;
export type Publish = (payload: unknown, idempotencyKey: string) => Promise<unknown>;

export type FanoutResult = {
  workOrderId: string;
  status: DispatchRequest["status"];
  queued: number;
  skipped: number;
};

function notificationKey(workOrderId: string, subscriberId: string): string {
  return createHash("sha256")
    .update(`${workOrderId}:dispatched:${subscriberId}`)
    .digest("hex");
}

export async function fanOutDispatch(
  request: DispatchRequest,
  publish: Publish,
): Promise<FanoutResult> {
  const recipients = request.status === "dispatched"
    ? request.subscribers.filter((subscriber) => subscriber.enabled)
    : [];

  await Promise.all(recipients.map((subscriber) => publish({
    event: "work_order.dispatched",
    workOrderId: request.workOrderId,
    dispatchStatus: request.status,
    subscriberId: subscriber.subscriberId,
    channel: subscriber.channel,
    photos: request.photos,
    technicianFollowUpAt: request.technicianFollowUpAt,
  }, notificationKey(request.workOrderId, subscriber.subscriberId))));

  return {
    workOrderId: request.workOrderId,
    status: request.status,
    queued: recipients.length,
    skipped: request.subscribers.length - recipients.length,
  };
}
