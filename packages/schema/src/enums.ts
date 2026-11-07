import { Schema } from "effect";

export const CHANNEL_TYPES     = ["email", "sms", "telegram"] as const;
export type ChannelType        = (typeof CHANNEL_TYPES)[number];
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

// Brand assets an external system can upload. `email_header` is a wide banner
// used at the top of email layouts; it falls back to `logo` when absent.
export const ASSET_KINDS     = ["logo", "logo_dark", "icon", "email_header"] as const;
export type AssetKind        = (typeof ASSET_KINDS)[number];
export const assetKindSchema = Schema.Literals(ASSET_KINDS);

// Accepted image formats, identified by sniffing the bytes — never trusted
// from the client-declared type or the filename.
export const ASSET_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
] as const;
export type AssetContentType        = (typeof ASSET_CONTENT_TYPES)[number];
export const assetContentTypeSchema = Schema.Literals(ASSET_CONTENT_TYPES);
