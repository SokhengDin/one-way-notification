import { Effect, Schema } from "effect";
import { channelTypeSchema } from "../enums";


export class NotificationTemplateRecord extends Schema.Class<NotificationTemplateRecord>(
  "NotificationTemplateRecord"
)({
  id: Schema.String,
  external_system_id: Schema.String,
  event_type: Schema.String,
  channel: channelTypeSchema,
  template: Schema.String,
  subject: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
}) {}

export class ChannelProviderRecord extends Schema.Class<ChannelProviderRecord>(
  "ChannelProviderRecord"
) ({
  id: Schema.String,
  channel: channelTypeSchema,
  name: Schema.String,
  is_active: Schema.NullOr(Schema.Boolean).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefault(Effect.succeed(true))
  ),
  created_at: Schema.String,
  updated_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
}) {}