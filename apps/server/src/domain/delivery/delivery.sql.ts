import {
  DeliveryAttempt,
  DeliveryListItem,
  DeliveryQueueStats,
  DeliveryRepoError,
  makeMapSqlError,
  normalizePagination,
  type DeliveryRepoOperation,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { ClaimedDelivery, DeliveryRepoService, ProviderCandidate } from "./delivery.types";

const { mapSqlError } = makeMapSqlError<DeliveryRepoOperation, DeliveryRepoError>(
  (fields) => new DeliveryRepoError(fields),
  "Failed to query deliveries",
);

// Circuit breaker: after this many failures in a row a provider cools down,
// for 30 s doubling per further failure, at most 15 min.
export const BREAKER_THRESHOLD   = 3;
export const BREAKER_BASE_S      = 30;
export const BREAKER_MAX_S       = 15 * 60;

const int = (value: unknown) => Number(value ?? 0);

export function makeSqlDeliveryRepo(sql: SqlClient): DeliveryRepoService {
  // A delivery with everything a list row needs.
  const ITEM_SELECT = sql.literal(`
    SELECT d.id, d.notification_id, d.channel, d.status, d.recipient,
           d.attempt_count, d.max_attempts, d.last_error, d.next_attempt_at, d.sent_at,
           (d.locked_until IS NOT NULL AND d.locked_until > now()) AS in_flight,
           d.provider_id, p.name AS provider_name,
           n.event_type, n.user_id, ul.display_name AS user_display_name,
           n.external_system_id, s.name AS system_name,
           d.created_at, d.updated_at
    FROM notification_deliveries d
    JOIN notifications n          ON n.id = d.notification_id
    JOIN external_systems s       ON s.id = n.external_system_id
    JOIN user_labels ul           ON ul.id = n.user_id
    LEFT JOIN channel_providers p ON p.id = d.provider_id
  `);

  const toItem = (row: Record<string, unknown>) => new DeliveryListItem(row as unknown as DeliveryListItem);

  const findDelivery: DeliveryRepoService["findDelivery"] = Effect.fn("DeliveryRepo.findDelivery")(
    function* (id) {
      const rows = yield* sql<Record<string, unknown>>`
        ${ITEM_SELECT}
        WHERE d.id = ${id} AND d.deleted_at IS NULL
      `.pipe(mapSqlError("findDelivery"));
      return rows[0] ? toItem(rows[0]) : null;
    },
  );

  const listDeliveries: DeliveryRepoService["listDeliveries"] = Effect.fn("DeliveryRepo.listDeliveries")(
    function* (input) {
      const { skip, limit } = normalizePagination(input);
      const status         = input.status ?? null;
      const channel        = input.channel ?? null;
      const providerId     = input.provider_id ?? null;
      const systemId       = input.external_system_id ?? null;
      const notificationId = input.notification_id ?? null;
      const q              = input.q?.trim() || null;
      const pattern        = q === null ? null : `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

      const rows = yield* sql<Record<string, unknown>>`
        ${ITEM_SELECT}
        WHERE d.deleted_at IS NULL
          AND (${status}::text IS NULL         OR d.status::text  = ${status}::text)
          AND (${channel}::text IS NULL        OR d.channel::text = ${channel}::text)
          AND (${providerId}::uuid IS NULL     OR d.provider_id = ${providerId}::uuid)
          AND (${systemId}::uuid IS NULL       OR n.external_system_id = ${systemId}::uuid)
          AND (${notificationId}::uuid IS NULL OR d.notification_id = ${notificationId}::uuid)
          AND (${pattern}::text IS NULL
               OR d.recipient ILIKE ${pattern}::text OR n.event_type ILIKE ${pattern}::text
               OR ul.display_name ILIKE ${pattern}::text OR d.last_error ILIKE ${pattern}::text)
        ORDER BY d.created_at DESC, d.id
        LIMIT ${limit + 1} OFFSET ${skip}
      `.pipe(mapSqlError("listDeliveries"));

      // Exact counts over a big deliveries table are slow; count separately
      // with the same filter only when the page doesn't tell us the total.
      const items = rows.slice(0, limit).map(toItem);
      let total   = skip + rows.length;
      if (rows.length > limit) {
        const [counted] = yield* sql<{ total: number }>`
          SELECT count(*)::int AS total
          FROM notification_deliveries d
          JOIN notifications n ON n.id = d.notification_id
          JOIN user_labels ul  ON ul.id = n.user_id
          WHERE d.deleted_at IS NULL
            AND (${status}::text IS NULL         OR d.status::text  = ${status}::text)
            AND (${channel}::text IS NULL        OR d.channel::text = ${channel}::text)
            AND (${providerId}::uuid IS NULL     OR d.provider_id = ${providerId}::uuid)
            AND (${systemId}::uuid IS NULL       OR n.external_system_id = ${systemId}::uuid)
            AND (${notificationId}::uuid IS NULL OR d.notification_id = ${notificationId}::uuid)
            AND (${pattern}::text IS NULL
                 OR d.recipient ILIKE ${pattern}::text OR n.event_type ILIKE ${pattern}::text
                 OR ul.display_name ILIKE ${pattern}::text OR d.last_error ILIKE ${pattern}::text)
        `.pipe(mapSqlError("listDeliveries"));
        total = int(counted?.total);
      }

      return { items, total, skip, limit };
    },
  );

  const listAttempts: DeliveryRepoService["listAttempts"] = Effect.fn("DeliveryRepo.listAttempts")(
    function* (deliveryId) {
      const rows = yield* sql<Record<string, unknown>>`
        SELECT u.id, u.provider_id, p.name AS provider_name, p.kind AS provider_kind,
               u.success, u.status_code, u.error, u.provider_ref_id, u.duration_ms, u.attempted_at
        FROM provider_usage_log u
        JOIN channel_providers p ON p.id = u.provider_id
        WHERE u.delivery_id = ${deliveryId}
        ORDER BY u.attempted_at DESC, u.id
        LIMIT 200
      `.pipe(mapSqlError("listAttempts"));
      return rows.map((row) => new DeliveryAttempt(row as unknown as DeliveryAttempt));
    },
  );

  const queueStats: DeliveryRepoService["queueStats"] = Effect.fn("DeliveryRepo.queueStats")(
    function* (workerEnabled) {
      const [row] = yield* sql<Record<string, unknown>>`
        SELECT
          count(*) FILTER (WHERE status = 'pending')                                              AS pending,
          count(*) FILTER (WHERE status = 'retrying')                                             AS retrying,
          count(*) FILTER (WHERE status IN ('pending', 'retrying') AND locked_until > now())      AS in_flight,
          count(*) FILTER (WHERE status IN ('pending', 'retrying') AND next_attempt_at <= now()
                             AND (locked_until IS NULL OR locked_until <= now()))                 AS due,
          extract(epoch FROM now() - min(next_attempt_at) FILTER (
            WHERE status IN ('pending', 'retrying') AND next_attempt_at <= now()))::int            AS oldest_due_age_s,
          count(*) FILTER (WHERE status = 'sent'   AND sent_at    >= now() - interval '1 hour')   AS sent_last_hour,
          count(*) FILTER (WHERE status = 'failed' AND updated_at >= now() - interval '1 hour')   AS failed_last_hour,
          count(*) FILTER (WHERE status = 'failed')                                               AS failed_total
        FROM notification_deliveries
        WHERE deleted_at IS NULL
      `.pipe(mapSqlError("queueStats"));
      return new DeliveryQueueStats({
        pending:          int(row?.pending),
        retrying:         int(row?.retrying),
        in_flight:        int(row?.in_flight),
        due:              int(row?.due),
        oldest_due_age_s: row?.oldest_due_age_s === null || row?.oldest_due_age_s === undefined ? null : int(row.oldest_due_age_s),
        sent_last_hour:   int(row?.sent_last_hour),
        failed_last_hour: int(row?.failed_last_hour),
        failed_total:     int(row?.failed_total),
        worker_enabled:   workerEnabled,
      });
    },
  );

  // ---------- worker ----------

  const claimDue: DeliveryRepoService["claimDue"] = Effect.fn("DeliveryRepo.claimDue")(
    function* (workerId, limit, leaseSeconds) {
      // SKIP LOCKED: concurrent workers each take a different slice. The
      // lease (locked_until) keeps the rows away from other workers after
      // this transaction commits, and hands them back if this one dies.
      const rows = yield* sql<Record<string, unknown>>`
        WITH due AS (
          SELECT id FROM notification_deliveries
          WHERE status IN ('pending', 'retrying')
            AND deleted_at IS NULL
            AND next_attempt_at <= now()
            AND (locked_until IS NULL OR locked_until <= now())
          ORDER BY next_attempt_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        ),
        claimed AS (
          UPDATE notification_deliveries d
          SET locked_until = now() + make_interval(secs => ${leaseSeconds}::int),
              locked_by    = ${workerId}
          FROM due
          WHERE d.id = due.id
          RETURNING d.id, d.notification_id, d.channel, d.recipient, d.attempt_count, d.max_attempts
        )
        SELECT c.*, n.external_system_id, n.event_type, n.payload, t.id AS template_id
        FROM claimed c
        JOIN notifications n ON n.id = c.notification_id
        LEFT JOIN notification_templates t
               ON t.external_system_id = n.external_system_id
              AND t.event_type = n.event_type
              AND t.channel = c.channel
              AND t.deleted_at IS NULL
      `.pipe(mapSqlError("claimDue"));
      return rows as unknown as ReadonlyArray<ClaimedDelivery>;
    },
  );

  const providersFor: DeliveryRepoService["providersFor"] = Effect.fn("DeliveryRepo.providersFor")(
    function* (channel) {
      const rows = yield* sql<ProviderCandidate>`
        SELECT id, name
        FROM channel_providers
        WHERE channel = ${channel} AND is_active AND deleted_at IS NULL AND kind IS NOT NULL
        ORDER BY (cooldown_until IS NOT NULL AND cooldown_until > now()), priority, name
      `.pipe(mapSqlError("loadWork"));
      return rows;
    },
  );

  const recordAttempt: DeliveryRepoService["recordAttempt"] = Effect.fn("DeliveryRepo.recordAttempt")(
    function* (input) {
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`
            INSERT INTO provider_usage_log
              (delivery_id, provider_id, provider_ref_id, status_code, raw_response, success, error, duration_ms)
            VALUES (${input.delivery_id}, ${input.provider_id}, ${input.provider_ref_id}, ${input.status_code},
                    ${input.raw_response}, ${input.success}, ${input.error}, ${input.duration_ms})
          `;
          if (input.success) {
            yield* sql`
              UPDATE channel_providers
              SET consecutive_failures = 0, last_success_at = now(), cooldown_until = NULL
              WHERE id = ${input.provider_id}
            `;
          } else if (input.trips_breaker) {
            // only provider-side trouble counts against its health; a bad
            // recipient address says nothing about the provider
            yield* sql`
              UPDATE channel_providers
              SET consecutive_failures = consecutive_failures + 1,
                  last_failure_at      = now(),
                  last_error           = ${input.error},
                  cooldown_until       = CASE
                    WHEN consecutive_failures + 1 >= ${BREAKER_THRESHOLD}::int
                      THEN now() + make_interval(secs => LEAST(
                        ${BREAKER_BASE_S}::int * power(2, LEAST(consecutive_failures + 1 - ${BREAKER_THRESHOLD}::int, 10)),
                        ${BREAKER_MAX_S}::int))
                    ELSE cooldown_until
                  END
              WHERE id = ${input.provider_id}
            `;
          }
        }),
      ).pipe(mapSqlError("recordAttempt"));
    },
  );

  const complete: DeliveryRepoService["complete"] = Effect.fn("DeliveryRepo.complete")(
    function* (deliveryId, workerId, outcome) {
      const status     = outcome._tag === "Sent" ? "sent" : outcome._tag === "Retry" ? "retrying" : "failed";
      const error      = outcome._tag === "Sent" ? null : outcome.error;
      const providerId = outcome.providerId;
      const delayMs    = outcome._tag === "Retry" ? Math.round(outcome.delayMs) : 0;

      // Guarded by the lease: if it expired and another worker took the row,
      // that worker's result wins. Also never overwrite a cancel.
      const rows = yield* sql<{ id: string }>`
        UPDATE notification_deliveries
        SET status          = ${status}::delivery_status,
            attempt_count   = attempt_count + 1,
            last_error      = ${error},
            provider_id     = COALESCE(${providerId}::uuid, provider_id),
            sent_at         = CASE WHEN ${status} = 'sent' THEN now() ELSE sent_at END,
            next_attempt_at = now() + make_interval(secs => ${delayMs / 1000}::double precision),
            locked_until    = NULL,
            locked_by       = NULL,
            updated_at      = now()
        WHERE id = ${deliveryId}
          AND locked_by = ${workerId}
          AND status IN ('pending', 'retrying')
        RETURNING id
      `.pipe(mapSqlError("completeDelivery"));
      return rows.length > 0;
    },
  );

  // ---------- operator actions ----------

  const retry: DeliveryRepoService["retry"] = Effect.fn("DeliveryRepo.retry")(
    function* (id, extraAttempts) {
      const current = yield* findDelivery(id);
      if (current === null) return { _tag: "NotFound" } as const;
      if (current.status === "sent") {
        return { _tag: "Conflict", message: "This delivery was already sent" } as const;
      }
      if (current.in_flight) {
        return { _tag: "Conflict", message: "This delivery is being sent right now" } as const;
      }

      // Re-read the user's contact: retrying is how an operator says "I
      // fixed the address", and it's how a skipped delivery gets another go.
      const rows = yield* sql<{ id: string; recipient: string | null }>`
        WITH contact AS (
          SELECT c.address, c.linked
          FROM notification_deliveries d
          JOIN notifications n ON n.id = d.notification_id
          JOIN user_contacts c ON c.user_id = n.user_id AND c.channel = d.channel AND c.deleted_at IS NULL
          WHERE d.id = ${id}
          LIMIT 1
        )
        UPDATE notification_deliveries d
        SET status          = 'retrying',
            recipient       = COALESCE((SELECT address FROM contact
                                        WHERE address IS NOT NULL AND btrim(address) <> ''
                                          AND (d.channel <> 'telegram' OR linked)), d.recipient),
            next_attempt_at = now(),
            max_attempts    = LEAST(GREATEST(d.max_attempts, d.attempt_count + ${extraAttempts}::int), 50),
            last_error      = NULL,
            locked_until    = NULL,
            locked_by       = NULL,
            updated_at      = now()
        WHERE d.id = ${id} AND d.status <> 'sent'
          AND (d.locked_until IS NULL OR d.locked_until <= now())
        RETURNING d.id, d.recipient
      `.pipe(mapSqlError("retryDelivery"));

      if (rows.length === 0) {
        return { _tag: "Conflict", message: "This delivery changed while retrying it; reload and try again" } as const;
      }
      if (rows[0]!.recipient === null) {
        // nothing to send to: put it back as skipped with the reason
        yield* sql`
          UPDATE notification_deliveries
          SET status = 'skipped', last_error = ${`User still has no ${current.channel} contact`}, updated_at = now()
          WHERE id = ${id}
        `.pipe(mapSqlError("retryDelivery"));
        return { _tag: "Conflict", message: `The user still has no ${current.channel} contact to send to` } as const;
      }

      const item = yield* findDelivery(id);
      return item ? ({ _tag: "Ok", item } as const) : ({ _tag: "NotFound" } as const);
    },
  );

  const cancel: DeliveryRepoService["cancel"] = Effect.fn("DeliveryRepo.cancel")(
    function* (id) {
      const current = yield* findDelivery(id);
      if (current === null) return { _tag: "NotFound" } as const;
      if (current.status !== "pending" && current.status !== "retrying") {
        return { _tag: "Conflict", message: `Only queued deliveries can be cancelled; this one is ${current.status}` } as const;
      }
      if (current.in_flight) {
        return { _tag: "Conflict", message: "This delivery is being sent right now" } as const;
      }
      const rows = yield* sql<{ id: string }>`
        UPDATE notification_deliveries
        SET status = 'cancelled', last_error = 'Cancelled from the dashboard', updated_at = now()
        WHERE id = ${id} AND status IN ('pending', 'retrying')
          AND (locked_until IS NULL OR locked_until <= now())
        RETURNING id
      `.pipe(mapSqlError("cancelDelivery"));
      if (rows.length === 0) {
        return { _tag: "Conflict", message: "This delivery changed while cancelling it; reload and try again" } as const;
      }
      const item = yield* findDelivery(id);
      return item ? ({ _tag: "Ok", item } as const) : ({ _tag: "NotFound" } as const);
    },
  );

  const retryFailed: DeliveryRepoService["retryFailed"] = Effect.fn("DeliveryRepo.retryFailed")(
    function* (filter, extraAttempts) {
      const channel    = filter.channel ?? null;
      const providerId = filter.provider_id ?? null;
      const rows = yield* sql<{ id: string }>`
        WITH picked AS (
          SELECT id FROM notification_deliveries
          WHERE status = 'failed' AND deleted_at IS NULL
            AND (${channel}::text IS NULL    OR channel::text = ${channel}::text)
            AND (${providerId}::uuid IS NULL OR provider_id = ${providerId}::uuid)
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 500
          FOR UPDATE SKIP LOCKED
        )
        UPDATE notification_deliveries d
        SET status          = 'retrying',
            next_attempt_at = now(),
            max_attempts    = LEAST(GREATEST(d.max_attempts, d.attempt_count + ${extraAttempts}::int), 50),
            last_error      = NULL,
            updated_at      = now()
        FROM picked
        WHERE d.id = picked.id
        RETURNING d.id
      `.pipe(mapSqlError("retryFailed"));
      return rows.length;
    },
  );

  return {
    listDeliveries,
    findDelivery,
    listAttempts,
    queueStats,
    claimDue,
    providersFor,
    recordAttempt,
    complete,
    retry,
    cancel,
    retryFailed,
  };
}
