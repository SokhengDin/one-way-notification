import { Schema } from "effect";

export class ExternalSystemRecord extends Schema.Class<ExternalSystemRecord>(
  "ExternalSystemRecord",
)({
  id: Schema.String,
  name: Schema.String,
  api_key: Schema.String,
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
  created_at: Schema.Date,
  updated_at: Schema.NullOr(Schema.Date),
  deleted_at: Schema.NullOr(Schema.Date),
}) {}
