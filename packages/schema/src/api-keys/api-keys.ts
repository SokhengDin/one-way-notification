import { Schema } from "effect";

export const ApiKeyStatus = Schema.Literals(["active", "expired", "revoked"]);
export type ApiKeyStatus = typeof ApiKeyStatus.Type;

/** Grace periods offered when rolling a key: how long the old one keeps working. */
export const API_KEY_ROLL_GRACE_HOURS = [0, 1, 24, 168] as const;

/** New keys must expire: between 1 day and 2 years. */
export const API_KEY_MIN_DAYS = 1;
export const API_KEY_MAX_DAYS = 730;
export const API_KEY_DEFAULT_DAYS = 90;

/** Keys a system can have working at once (rolling needs room for two). */
export const API_KEY_MAX_ACTIVE = 10;

/**
 * An external system's API key, as the dashboard sees it. The secret is
 * never part of this: it is shown once, when issued (IssuedApiKey), and only
 * its SHA-256 is stored.
 */
export class ApiKeyRecord extends Schema.Class<ApiKeyRecord>("ApiKeyRecord")({
  id:                 Schema.String,
  external_system_id: Schema.String,
  name:               Schema.String,
  /** public part, safe to show: "ownk_Ab12Cd34" */
  prefix:             Schema.String,
  /** last 4 characters of the key, to tell keys apart */
  last_four:          Schema.String,
  status:             ApiKeyStatus,
  /** moved from the old plaintext column: no expiry, should be rotated */
  legacy:             Schema.Boolean,
  expires_at:         Schema.NullOr(Schema.Date),
  created_at:         Schema.Date,
  created_by_name:    Schema.NullOr(Schema.String),
  revoked_at:         Schema.NullOr(Schema.Date),
  revoked_by_name:    Schema.NullOr(Schema.String),
  last_used_at:       Schema.NullOr(Schema.Date),
  last_used_ip:       Schema.NullOr(Schema.String),
}) {}

/** A freshly issued key: the only time the secret leaves the server. */
export class IssuedApiKey extends Schema.Class<IssuedApiKey>("IssuedApiKey")({
  key:    ApiKeyRecord,
  secret: Schema.String,
}) {}
