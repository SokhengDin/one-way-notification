import { Effect, Schema } from "effect";
import { channelTypeSchema, deliveryStatusSchema } from "../enums";


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

export class NotificationRecord extends Schema.Class<NotificationRecord>(
  "NotificationRecord"
)({
  id: Schema.String,
  external_system_id: Schema.String,
  user_id: Schema.String,
  event_type: Schema.String,
  payload: Schema.Record(Schema.String, Schema.Unknown),
  idempotency_key: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
}) {}

export class NotificationDeliveryRecord extends Schema.Class<NotificationDeliveryRecord>(
  "NotificationDeliveryRecord"
)({
  id: Schema.String,
  notification_id: Schema.String,
  channel: channelTypeSchema,
  provider_id: Schema.NullOr(Schema.String),
  status: deliveryStatusSchema,
  attempt_count: Schema.Int,
  last_error: Schema.NullOr(Schema.String),
  sent_at: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
}) {}