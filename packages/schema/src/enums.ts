import { Schema } from "effect";

export const CHANNEL_TYPES = ["email", "sms", "telegram"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];
export const channelTypeSchema = Schema.Literals(CHANNEL_TYPES);

export const DELIVERY_STATUSES = [
  "pending",
  "sent",
  "failed",
  "retrying",
  "skipped",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export const deliveryStatusSchema = Schema.Literals(DELIVERY_STATUSES);
