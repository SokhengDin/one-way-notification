// The delivery pipeline: process claimed deliveries, and the operator
// actions on them (retry, cancel, bulk retry).
//
// Guarantees: at-least-once. A delivery is only marked sent after a
// provider accepted it; if the process dies mid-send, the lease expires and
// another worker sends it again. Providers that support it (Resend) dedupe
// on the delivery id; the others receive it as a header/tag for tracing.

import {
  BulkRetryResult,
  DeliveryDetail,
  type DeliveryListItem,
  DeliveryNotFound,
  DeliveryStateConflict,
} from "@repo/schema";
import { Cause, Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { AppConfigLive, AppConfigService } from "../../config/config";
import { Notifications } from "../notifications/notifications";
import { Providers } from "../providers/providers";
import { retryDelayMs } from "./backoff";
import { makeSqlDeliveryRepo } from "./delivery.sql";
import type {
  ClaimedDelivery,
  DeliveriesService,
  DeliveryOutcome,
  DeliveryRepoService,
  RetryResult,
} from "./delivery.types";
import { SenderRegistry } from "./senders";

/** Parallel sends per batch. */
const CONCURRENCY = 5;

export class DeliveryRepo extends Context.Service<DeliveryRepo, DeliveryRepoService>()(
  "app/domain/delivery/DeliveryRepo",
) {
  static readonly layer = Layer.effect(
    DeliveryRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlDeliveryRepo(sql);
    }),
  );
}

const describe = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
};

export class Deliveries extends Context.Service<Deliveries, DeliveriesService>()(
  "app/domain/delivery/Deliveries",
) {
  static readonly layer = Layer.effect(
    Deliveries,
    Effect.gen(function* () {
      const repo          = yield* DeliveryRepo;
      const notifications = yield* Notifications;
      const providers     = yield* Providers;
      const senders       = yield* SenderRegistry;
      const config        = yield* AppConfigService;
      const settings      = config.delivery;

      // ---------- processing ----------

      /** Out of providers for this pass: schedule another, or give up. */
      const retryOrFail = (claim: ClaimedDelivery, providerId: string | null, error: string): DeliveryOutcome => {
        const attempt = claim.attempt_count + 1;
        if (attempt >= claim.max_attempts) {
          return { _tag: "Failed", providerId, error: `${error} (gave up after ${attempt} attempt${attempt === 1 ? "" : "s"})` };
        }
        return { _tag: "Retry", providerId, error, delayMs: retryDelayMs(attempt) };
      };

      const decide = Effect.fn("Deliveries.decide")(function* (claim: ClaimedDelivery) {
        if (claim.recipient === null || claim.recipient.trim() === "") {
          return { _tag: "Failed", providerId: null, error: `No ${claim.channel} address to send to` } satisfies DeliveryOutcome;
        }
        if (claim.template_id === null) {
          return {
            _tag: "Failed", providerId: null,
            error: `No ${claim.channel} template for "${claim.event_type}" any more (it was deleted)`,
          } satisfies DeliveryOutcome;
        }

        // Render now, not at fan-out: a template fix applies to retries.
        const rendered = yield* notifications.renderNotificationTemplate(claim.template_id, claim.payload).pipe(
          Effect.map((value) => ({ ok: true as const, value })),
          Effect.catchTags({
            NotificationTemplateInvalid:  (error) => Effect.succeed({ ok: false as const, retry: false, error: `Template can't be rendered: ${error.message}` }),
            NotificationTemplateNotFound: () => Effect.succeed({ ok: false as const, retry: false, error: "The template was deleted" }),
            NotificationRepoError:        (error) => Effect.succeed({ ok: false as const, retry: true, error: error.message }),
          }),
        );
        if (!rendered.ok) {
          return rendered.retry
            ? retryOrFail(claim, null, rendered.error)
            : ({ _tag: "Failed", providerId: null, error: rendered.error } satisfies DeliveryOutcome);
        }

        const candidates = yield* repo.providersFor(claim.channel);
        if (candidates.length === 0) {
          // an operator can still add one; keep the delivery alive
          return retryOrFail(claim, null, `No active ${claim.channel} provider is configured`);
        }

        const message = {
          channel:        claim.channel,
          to:             claim.recipient.trim(),
          subject:        rendered.value.subject,
          body:           rendered.value.body,
          text:           rendered.value.text,
          idempotencyKey: claim.id,
        };

        // Fail over through providers in order until one accepts it.
        const errors: Array<string> = [];
        let anyRetryable = false;
        let lastProvider: string | null = null;

        for (const candidate of candidates) {
          lastProvider = candidate.id;

          const credentials = yield* providers.resolveProviderCredentials(candidate.id).pipe(
            Effect.map((value) => ({ ok: true as const, value })),
            Effect.catch((error) => Effect.succeed({ ok: false as const, error: describe(error) })),
          );
          if (!credentials.ok) {
            yield* repo.recordAttempt({
              delivery_id: claim.id, provider_id: candidate.id, success: false, status_code: null,
              error: credentials.error, provider_ref_id: null, raw_response: null, duration_ms: 0,
              trips_breaker: true,
            });
            errors.push(`${candidate.name}: ${credentials.error}`);
            // fixable by an operator without touching the message
            anyRetryable = true;
            continue;
          }

          const result = yield* senders.send(credentials.value, message, settings.sendTimeoutMs);

          yield* repo.recordAttempt({
            delivery_id:     claim.id,
            provider_id:     candidate.id,
            success:         result.ok,
            status_code:     result.statusCode,
            error:           result.ok ? null : result.error,
            provider_ref_id: result.ok ? result.providerRefId : null,
            raw_response:    result.raw,
            duration_ms:     result.durationMs,
            // a bad recipient isn't the provider's fault; timeouts, 5xx and
            // rejected credentials are
            trips_breaker:   !result.ok && !result.recipientError &&
                             (result.retryable || result.statusCode === 401 || result.statusCode === 403),
          });

          if (result.ok) {
            return { _tag: "Sent", providerId: candidate.id } satisfies DeliveryOutcome;
          }
          errors.push(`${candidate.name}: ${result.error}`);
          anyRetryable ||= result.retryable;
        }

        const error = errors.join(" · ");
        return anyRetryable
          ? retryOrFail(claim, lastProvider, error)
          : ({ _tag: "Failed", providerId: lastProvider, error } satisfies DeliveryOutcome);
      });

      const processOne = (claim: ClaimedDelivery, workerId: string) =>
        decide(claim).pipe(
          Effect.tap((outcome) => repo.complete(claim.id, workerId, outcome)),
          Effect.map((outcome) => outcome._tag),
          // Something unexpected (e.g. the database went away mid-way): log
          // it and leave the lease to expire, so the delivery comes back.
          Effect.catchCause((cause) =>
            Effect.logError(`Delivery ${claim.id} failed unexpectedly; it will be retried when its lease expires`, Cause.pretty(cause)).pipe(
              Effect.as("Error" as const),
            ),
          ),
        );

      const processDue: DeliveriesService["processDue"] = (workerId) =>
        repo.claimDue(workerId, settings.batchSize, settings.leaseSeconds).pipe(
          Effect.flatMap((claims) =>
            Effect.forEach(claims, (claim) => processOne(claim, workerId), { concurrency: CONCURRENCY }),
          ),
          Effect.map((outcomes) => ({
            claimed:  outcomes.length,
            sent:     outcomes.filter((tag) => tag === "Sent").length,
            retrying: outcomes.filter((tag) => tag === "Retry").length,
            failed:   outcomes.filter((tag) => tag === "Failed").length,
          })),
          Effect.catchCause((cause) =>
            Effect.logError("Delivery worker couldn't claim work", Cause.pretty(cause)).pipe(
              Effect.as({ claimed: 0, sent: 0, retrying: 0, failed: 0 }),
            ),
          ),
          Effect.withSpan("Deliveries.processDue"),
        );

      // ---------- reads ----------

      const listDeliveries: DeliveriesService["listDeliveries"] = (input) => repo.listDeliveries(input);

      const getDelivery: DeliveriesService["getDelivery"] = Effect.fn("Deliveries.getDelivery")(function* (id) {
        const delivery = yield* repo.findDelivery(id);
        if (delivery === null) return yield* new DeliveryNotFound({ id });
        const attempts = yield* repo.listAttempts(id);
        return new DeliveryDetail({ delivery, attempts: [...attempts] });
      });

      const getQueue: DeliveriesService["getQueue"] = repo.queueStats(settings.workerEnabled);

      // ---------- operator actions ----------

      const unwrap = (id: string) => (
        result: RetryResult,
      ): Effect.Effect<DeliveryListItem, DeliveryNotFound | DeliveryStateConflict> => {
        switch (result._tag) {
          case "Ok":       return Effect.succeed(result.item);
          case "NotFound": return Effect.fail(new DeliveryNotFound({ id }));
          case "Conflict": return Effect.fail(new DeliveryStateConflict({ message: result.message }));
        }
      };

      const retryDelivery: DeliveriesService["retryDelivery"] = (id) =>
        repo.retry(id, settings.maxAttempts).pipe(Effect.flatMap(unwrap(id)));

      const cancelDelivery: DeliveriesService["cancelDelivery"] = (id) =>
        repo.cancel(id).pipe(Effect.flatMap(unwrap(id)));

      const retryFailed: DeliveriesService["retryFailed"] = (filter) =>
        repo.retryFailed(filter, settings.maxAttempts).pipe(Effect.map((retried) => new BulkRetryResult({ retried })));

      return {
        listDeliveries,
        getDelivery,
        getQueue,
        retryDelivery,
        cancelDelivery,
        retryFailed,
        processDue,
      };
    }),
  ).pipe(
    Layer.provide([DeliveryRepo.layer, Notifications.layer, Providers.layer, AppConfigLive]),
  );
}
