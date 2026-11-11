import { Schema } from "effect";

export class ExternalSystemRecord extends Schema.Class<ExternalSystemRecord>(
  "ExternalSystemRecord",
)({
  id: Schema.String,
  name: Schema.String,
  /** keys that work right now (issued from the dashboard, see ApiKeyRecord) */
  active_api_keys: Schema.Int,
  // activity, for the list
  template_count: Schema.Int,
  user_count: Schema.Int,
  notifications_30d: Schema.Int,
  last_notification_at: Schema.NullOr(Schema.Date),
  created_at: Schema.Date,
  updated_at: Schema.NullOr(Schema.Date),
  deleted_at: Schema.NullOr(Schema.Date),
}) {}

export class ExternalUserLinkRecord extends Schema.Class<ExternalUserLinkRecord>(
  "ExternalUserLinkRecord",
)({
  id: Schema.String,
  external_system_id: Schema.String,
  external_user_id: Schema.String,
  user_id: Schema.String,
  // readable labels for the dashboard
  system_name: Schema.String,
  user_display_name: Schema.String,
  created_at: Schema.Date,
  updated_at: Schema.NullOr(Schema.Date),
  deleted_at: Schema.NullOr(Schema.Date),
}) {}
