import { Effect, Schema } from "effect";
import { channelTypeSchema } from "../enums";

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
  created_at: Schema.String,
  updated_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
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
  attempted_at: Schema.String,
}) {}
