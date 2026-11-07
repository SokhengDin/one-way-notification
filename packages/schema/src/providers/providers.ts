import { Effect, Schema } from "effect";
import { channelTypeSchema } from "../enums";

export const ProviderConfigValueSchema = Schema.Union([Schema.String, Schema.Number]);

export class ChannelProviderRecord extends Schema.Class<ChannelProviderRecord>(
  "ChannelProviderRecord",
)({
  id: Schema.String,
  channel: channelTypeSchema,
  name: Schema.String,
  is_active: Schema.NullOr(Schema.Boolean).pipe(
    Schema.optionalKey,
    Schema.withDecodingDefault(Effect.succeed(true)),
  ),
  // catalog id (see provider-kinds.ts); null for legacy, unconfigured rows
  kind: Schema.NullOr(Schema.String),
  // non-secret settings only — secrets are never part of a record
  config: Schema.Record(Schema.String, ProviderConfigValueSchema),
  // which secret fields are set (values are write-only)
  secret_keys: Schema.Array(Schema.String),
  priority: Schema.Int,
  created_at: Schema.Date,
  updated_at: Schema.NullOr(Schema.Date),
  deleted_at: Schema.NullOr(Schema.Date),
}) {}

export class ProviderUsageLogRecord extends Schema.Class<ProviderUsageLogRecord>(
  "ProviderUsageLogRecord",
)({
  id: Schema.String,
  delivery_id: Schema.String,
  provider_id: Schema.String,
  provider_ref_id: Schema.NullOr(Schema.String),
  status_code: Schema.NullOr(Schema.Int),
  cost: Schema.NullOr(Schema.String),
  raw_response: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  attempted_at: Schema.Date,
}) {}
