import { Schema } from "effect";
import { channelTypeSchema } from "../enums";

export class UserRecord extends Schema.Class<UserRecord>("UserRecord")({
  id: Schema.String,
  created_at: Schema.Date,
  updated_at: Schema.NullOr(Schema.Date),
  deleted_at: Schema.NullOr(Schema.Date),
}) {}

export class UserContactRecord extends Schema.Class<UserContactRecord>(
  "UserContactRecord",
)({
  id: Schema.String,
  user_id: Schema.String,
  channel: channelTypeSchema,
  address: Schema.NullOr(Schema.String),
  linked: Schema.Boolean,
  verified: Schema.Boolean,
  created_at: Schema.Date,
  updated_at: Schema.Date,
  deleted_at: Schema.NullOr(Schema.Date),
}) {}

export class UserPreferenceRecord extends Schema.Class<UserPreferenceRecord>(
  "UserPreferenceRecord",
)({
  user_id: Schema.String,
  channel: channelTypeSchema,
  enabled: Schema.Boolean,
}) {}
