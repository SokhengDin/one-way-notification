import { Effect } from "effect";
import { channelTypeSchema } from "@repo/schema";

export interface CreateNotificationTemplate {
  readonly external_system_id: string;
  readonly event_type: string;
  readonly channel_type: string;
  readonly template: string;
  readonly subject: string;
}