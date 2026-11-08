// The background worker: poll for due deliveries and process them, forever,
// for as long as the server runs. Safe to run in every API replica —
// claiming uses SKIP LOCKED plus a lease, so replicas never double-send.

import { Effect, Layer } from "effect";
import { hostname } from "node:os";
import { AppConfigLive, AppConfigService } from "../../config/config";
import { Deliveries } from "./delivery";

export const DeliveryWorkerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const { workerEnabled, pollIntervalMs, batchSize } = config.delivery;

    if (!workerEnabled) {
      yield* Effect.logInfo("Delivery worker disabled (DELIVERY_WORKER_ENABLED=false)");
      return;
    }

    const deliveries = yield* Deliveries;
    const workerId   = `${hostname()}-${process.pid}`;

    // A full batch means there's probably more waiting: go again at once.
    // Otherwise sleep until the next poll.
    const loop = Effect.gen(function* () {
      while (true) {
        const summary = yield* deliveries.processDue(workerId);
        if (summary.claimed > 0) {
          yield* Effect.logDebug(
            `Processed ${summary.claimed}: ${summary.sent} sent, ${summary.retrying} retrying, ${summary.failed} failed`,
          );
        }
        if (summary.claimed < batchSize) {
          yield* Effect.sleep(pollIntervalMs);
        }
      }
    });

    yield* Effect.logInfo(`Delivery worker ${workerId} started (poll every ${pollIntervalMs} ms, batch ${batchSize})`);
    yield* Effect.forkScoped(loop);
  }),
).pipe(Layer.provide([Deliveries.layer, AppConfigLive]));
