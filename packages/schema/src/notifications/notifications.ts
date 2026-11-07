import { Schema } from "effect";
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
  created_at: Schema.Date,
  updated_at: Schema.Date,
  deleted_at: Schema.NullOr(Schema.Date)
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
  created_at: Schema.Date,
  updated_at: Schema.NullOr(Schema.Date),
  deleted_at: Schema.NullOr(Schema.Date),
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
  sent_at: Schema.NullOr(Schema.Date),
  created_at: Schema.Date,
  updated_at: Schema.NullOr(Schema.Date),
  deleted_at: Schema.NullOr(Schema.Date),
}) {}
export class RenderedTemplate extends Schema.Class<RenderedTemplate>(
  "RenderedTemplate"
)({
  channel:   channelTypeSchema,
  subject:   Schema.NullOr(Schema.String),
  // email: full HTML document; sms/telegram: plain text
  body:      Schema.String,
  // email only: text/plain alternative derived from the HTML
  text:      Schema.NullOr(Schema.String),
  variables: Schema.Array(Schema.String),
  missing:   Schema.Array(Schema.String),
  warnings:  Schema.Array(Schema.String),
}) {}
