import { Schema } from "effect";

export const ProviderRepoOperation = Schema.Literals([
  // channel_providers
  "addChannelProvider",
  "findChannelProviderById",
  "listChannelProviders",
  "updateChannelProvider",
  "deleteChannelProvider",
  // provider_usage_log
  "addProviderUsageLog",
  "listProviderUsageLogByDelivery",
]);

export type ProviderRepoOperation = typeof ProviderRepoOperation.Type;

export class ProviderRepoError extends Schema.TaggedErrorClass<ProviderRepoError>()(
  "ProviderRepoError",
  {
    message: Schema.String,
    operation: ProviderRepoOperation,
    sqlState: Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

export class ChannelProviderNotFound extends Schema.TaggedErrorClass<ChannelProviderNotFound>()(
  "ChannelProviderNotFound",
  {
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ChannelProviderConflict extends Schema.TaggedErrorClass<ChannelProviderConflict>()(
  "ChannelProviderConflict",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}
