import { Schema } from "effect";

export const ApiKeyRepoOperation = Schema.Literals([
  "insertApiKey",
  "listApiKeys",
  "findApiKeyById",
  "revokeApiKey",
  "shortenApiKey",
  "countActiveApiKeys",
  "findActiveKeyByHash",
  "touchApiKey",
]);

export type ApiKeyRepoOperation = typeof ApiKeyRepoOperation.Type;

export class ApiKeyRepoError extends Schema.TaggedErrorClass<ApiKeyRepoError>()(
  "ApiKeyRepoError",
  {
    message:    Schema.String,
    operation:  ApiKeyRepoOperation,
    sqlState:   Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause:      Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

export class ApiKeyNotFound extends Schema.TaggedErrorClass<ApiKeyNotFound>()(
  "ApiKeyNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Bad input: name, expiry, grace period, or acting on a key that no longer works. */
export class ApiKeyInvalid extends Schema.TaggedErrorClass<ApiKeyInvalid>()(
  "ApiKeyInvalid",
  { message: Schema.String },
  { httpApiStatus: 422 },
) {}

export class ApiKeyLimitReached extends Schema.TaggedErrorClass<ApiKeyLimitReached>()(
  "ApiKeyLimitReached",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}
