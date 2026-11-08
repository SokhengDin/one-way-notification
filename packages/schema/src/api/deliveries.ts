import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { channelTypeSchema, deliveryStatusSchema } from "../enums";
import {
  BulkRetryResult,
  DeliveryDetail,
  DeliveryListItem,
  DeliveryProcessResult,
  DeliveryQueueStats,
} from "../deliveries/deliveries";
import { DeliveryNotFound, DeliveryRepoError, DeliveryStateConflict } from "../deliveries/deliveries.errors";
import { Uuid } from "../shared/ids";
import { PaginatedData, PaginationQuery } from "../shared/pagination";
import { ApiResponse } from "./response";

export class DeliveriesApiGroup extends HttpApiGroup.make("deliveries")
  .add(
    HttpApiEndpoint.get("listDeliveries", "/delivery", {
      query: {
        ...PaginationQuery,
        status:             Schema.optional(deliveryStatusSchema),
        channel:            Schema.optional(channelTypeSchema),
        provider_id:        Schema.optional(Uuid),
        external_system_id: Schema.optional(Uuid),
        notification_id:    Schema.optional(Uuid),
        // recipient, event type, user name or error text
        q:                  Schema.optional(Schema.String),
      },
      success: ApiResponse(PaginatedData(DeliveryListItem)),
      error:   DeliveryRepoError,
    }),
    HttpApiEndpoint.get("getDeliveryQueue", "/delivery/queue", {
      success: ApiResponse(DeliveryQueueStats),
      error:   DeliveryRepoError,
    }),
    // Requeue every failed delivery matching the filter (max 500 per call).
    HttpApiEndpoint.post("retryFailedDeliveries", "/delivery/retry-failed", {
      payload: Schema.Struct({
        channel:     Schema.optional(channelTypeSchema),
        provider_id: Schema.optional(Uuid),
      }),
      success: ApiResponse(BulkRetryResult),
      error:   DeliveryRepoError,
    }),
    // Process one batch of due deliveries now, in this request. The
    // background worker does this continuously; this is for "run now" in
    // the dashboard, tests, and setups that disable the worker.
    HttpApiEndpoint.post("processDueDeliveries", "/delivery/process", {
      success: ApiResponse(DeliveryProcessResult),
    }),
    HttpApiEndpoint.get("getDelivery", "/delivery/:id", {
      params:  { id: Uuid },
      success: ApiResponse(DeliveryDetail),
      error:   [DeliveryNotFound, DeliveryRepoError],
    }),
    // Send again now. Works on failed, cancelled and retrying deliveries;
    // grants extra attempts if the budget is used up.
    HttpApiEndpoint.post("retryDelivery", "/delivery/:id/retry", {
      params:  { id: Uuid },
      success: ApiResponse(DeliveryListItem),
      error:   [DeliveryNotFound, DeliveryStateConflict, DeliveryRepoError],
    }),
    HttpApiEndpoint.post("cancelDelivery", "/delivery/:id/cancel", {
      params:  { id: Uuid },
      success: ApiResponse(DeliveryListItem),
      error:   [DeliveryNotFound, DeliveryStateConflict, DeliveryRepoError],
    }),
  )
  .prefix("/api")
{}
