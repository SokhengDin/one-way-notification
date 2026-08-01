import { z } from "zod";

export const channelType = z.enum(["email", "sms", "telegram"]);
export type ChannelType = z.infer<typeof channelType>;

export const deliveryStatus = z.enum([
  "pending",
  "sent",
  "failed",
  "retrying",
  "skipped",
]);
export type DeliveryStatus = z.infer<typeof deliveryStatus>;
