import { Schema } from "effect";

export const DeliveryRepoOperation = Schema.Literals([
  "listDeliveries",
  "findDelivery",
  "listAttempts",
  "queueStats",
  "claimDue",
  "loadWork",
  "completeDelivery",
  "retryDelivery",
  "cancelDelivery",
  "retryFailed",
  "recordAttempt",
  "providerHealth",
]);

export type DeliveryRepoOperation = typeof DeliveryRepoOperation.Type;

export class DeliveryRepoError extends Schema.TaggedErrorClass<DeliveryRepoError>()(
  "DeliveryRepoError",
  {
    message:    Schema.String,
    operation:  DeliveryRepoOperation,
    sqlState:   Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause:      Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

export class DeliveryNotFound extends Schema.TaggedErrorClass<DeliveryNotFound>()(
  "DeliveryNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

// e.g. retrying a delivery that already went out, or cancelling one mid-send
export class DeliveryStateConflict extends Schema.TaggedErrorClass<DeliveryStateConflict>()(
  "DeliveryStateConflict",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}
