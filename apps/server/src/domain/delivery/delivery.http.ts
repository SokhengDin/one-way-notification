import { Api, DeliveryProcessResult, ok } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Deliveries } from "./delivery";

// identifies on-demand runs in locked_by, next to the background worker's id
const requestWorkerId = () => `api-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

export const DeliveriesApiHandlers = HttpApiBuilder.group(
  Api,
  "deliveries",
  Effect.fn(function* (handlers) {
    const deliveries = yield* Deliveries;

    return handlers
      .handle("listDeliveries", ({ query }) =>
        deliveries.listDeliveries(query).pipe(Effect.map((data) => ok(data))),
      )
      .handle("getDeliveryQueue", () =>
        deliveries.getQueue.pipe(Effect.map((data) => ok(data))),
      )
      .handle("retryFailedDeliveries", ({ payload }) =>
        deliveries.retryFailed(payload).pipe(Effect.map((data) => ok(data))),
      )
      .handle("processDueDeliveries", () =>
        deliveries
          .processDue(requestWorkerId())
          .pipe(Effect.map((summary) => ok(new DeliveryProcessResult(summary)))),
      )
      .handle("getDelivery", ({ params }) =>
        deliveries.getDelivery(params.id).pipe(Effect.map((data) => ok(data))),
      )
      .handle("retryDelivery", ({ params }) =>
        deliveries.retryDelivery(params.id).pipe(Effect.map((data) => ok(data))),
      )
      .handle("cancelDelivery", ({ params }) =>
        deliveries.cancelDelivery(params.id).pipe(Effect.map((data) => ok(data))),
      );
  }),
).pipe(Layer.provide(Deliveries.layer));
