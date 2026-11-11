import { Schema } from "effect";
import { channelTypeSchema } from "../enums";

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

/**
 * A user as seen from inside one external system: the person, plus the id
 * that system knows them by. Users live under their external system in the
 * dashboard.
 */
export class SystemUserRecord extends Schema.Class<SystemUserRecord>("SystemUserRecord")({
  id:                 Schema.String,
  /** the link between this user and the system */
  link_id:            Schema.String,
  external_system_id: Schema.String,
  external_user_id:   Schema.String,
  name:               Schema.NullOr(Schema.String),
  email:              Schema.NullOr(Schema.String),
  display_name:       Schema.String,
  channels:           Schema.Array(channelTypeSchema),
  /** other systems this user is also under */
  other_systems:      Schema.Int,
  created_at:         Schema.Date,
}) {}
