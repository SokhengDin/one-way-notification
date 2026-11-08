import { Schema } from "effect";

// Dashboard administrators. Never carries the password hash.
export class AdminRecord extends Schema.Class<AdminRecord>("AdminRecord")({
  id:            Schema.String,
  email:         Schema.String,
  name:          Schema.String,
  last_login_at: Schema.NullOr(Schema.Date),
  created_at:    Schema.Date,
}) {}

export class LoginResult extends Schema.Class<LoginResult>("LoginResult")({
  // opaque bearer token; send as `Authorization: Bearer <token>`
  token:      Schema.String,
  expires_at: Schema.Date,
  admin:      AdminRecord,
}) {}
