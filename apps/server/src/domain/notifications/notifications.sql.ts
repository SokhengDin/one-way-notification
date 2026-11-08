import {
  makeMapSqlError,
  NotificationConflict,
  NotificationDeliveryRecord,
  normalizePagination,
  NotificationRecord,
  NotificationRepoError,
  NotificationSummary,
  NotificationTemplateConflict,
  NotificationTemplateRecord,
  type NotificationRepoOperation,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { NotificationRepoService } from "./notifications.types";

/** pg returns text[] as an array, or as "{a,b}" through some drivers. */
export function parsePgArray(value: unknown): ReadonlyArray<string> {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1);
    return inner === "" ? [] : inner.split(",");
  }
  return [];
}

const { toRepoError: toNotificationRepoError, mapSqlError } = makeMapSqlError<
  NotificationRepoOperation,
  NotificationRepoError
>((fields) => new NotificationRepoError(fields), "Failed to query notifications");

export function makeSqlNotificationRepo(
  sql: SqlClient,
): NotificationRepoService {
  // ---------- notification_templates ----------

  // system_name rides along so every template shape is readable as-is
  const TEMPLATE_COLUMNS = sql.literal(
    "id, external_system_id, " +
      "(SELECT s.name FROM external_systems s WHERE s.id = external_system_id) AS system_name, " +
      "event_type, channel, template, subject, created_at, updated_at, deleted_at",
  );

  const addNotificationTemplate: NotificationRepoService["addNotificationTemplate"] =
    Effect.fn("NotificationsRepo.addNotificationTemplate")(function* (
      input,
    ) {
      const rows = yield* sql<NotificationTemplateRecord>`
        INSERT INTO notification_templates (external_system_id, event_type, channel, template, subject)
        VALUES (${input.external_system_id}, ${input.event_type}, ${input.channel}, ${input.template}, ${input.subject})
        RETURNING ${TEMPLATE_COLUMNS}
      `.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new NotificationTemplateConflict({
              message: `A template for event "${input.event_type}" on channel "${input.channel}" already exists for this system`,
            }),
          (_reasons, error) =>
            Effect.fail(toNotificationRepoError("addNotificationTemplate", error)),
        ),
      );

      return new NotificationTemplateRecord(rows[0]!);
    });

  const findNotificationTemplateById: NotificationRepoService["findNotificationTemplateById"] =
    Effect.fn("NotificationsRepo.findNotificationTemplateById")(function* (
      id,
    ) {
      const rows = yield* sql<NotificationTemplateRecord>`
        SELECT ${TEMPLATE_COLUMNS}
        FROM notification_templates
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(mapSqlError("findNotificationTemplateById"));

      const row = rows[0];
      return row ? new NotificationTemplateRecord(row) : null;
    });

  const listNotificationTemplates: NotificationRepoService["listNotificationTemplates"] =
    Effect.fn("NotificationsRepo.listNotificationTemplates")(function* (
      input,
    ) {
      const { skip, limit } = normalizePagination(input);
      const externalSystemId = input.external_system_id ?? null;
      const channel          = input.channel ?? null;
      const q                = input.q?.trim() || null;
      const pattern          = q === null ? null : `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

      const rows = yield* sql<
        NotificationTemplateRecord & { readonly total_count: number }
      >`
        SELECT ${TEMPLATE_COLUMNS},
               COUNT(*) OVER()::int AS total_count
        FROM notification_templates
        WHERE deleted_at IS NULL
          AND (${externalSystemId}::uuid IS NULL OR external_system_id = ${externalSystemId})
          AND (${channel}::text IS NULL OR channel::text = ${channel}::text)
          AND (${pattern}::text IS NULL OR event_type ILIKE ${pattern}::text OR subject ILIKE ${pattern}::text)
        ORDER BY event_type, channel, created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listNotificationTemplates"));

      return {
        items: rows.map((row) => new NotificationTemplateRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
    });

  const updateNotificationTemplate: NotificationRepoService["updateNotificationTemplate"] =
    Effect.fn("NotificationsRepo.updateNotificationTemplate")(function* (
      id,
      input,
    ) {
      const rows = yield* sql<NotificationTemplateRecord>`
        UPDATE notification_templates
        SET
          template = COALESCE(${input.template ?? null}, template),
          -- omitted subject keeps the current value; an explicit null clears it
          subject = CASE WHEN ${input.subject !== undefined}::boolean
                         THEN ${input.subject ?? null}::text
                         ELSE subject END,
          updated_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING ${TEMPLATE_COLUMNS}
      `.pipe(mapSqlError("updateNotificationTemplate"));

      const row = rows[0];
      return row ? new NotificationTemplateRecord(row) : null;
    });

  const deleteNotificationTemplate: NotificationRepoService["deleteNotificationTemplate"] =
    Effect.fn("NotificationsRepo.deleteNotificationTemplate")(function* (
      id,
    ) {
      const rows = yield* sql<{ id: string }>`
        UPDATE notification_templates
        SET deleted_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `.pipe(mapSqlError("deleteNotificationTemplate"));

      return rows.length > 0;
    });

  // ---------- notifications ----------

  const NOTIFICATION_COLUMNS = sql.literal(
    "id, external_system_id, user_id, event_type, payload, idempotency_key, created_at, updated_at, deleted_at",
  );

  const findByIdempotencyKey = (externalSystemId: string, key: string) =>
    sql<NotificationRecord>`
      SELECT ${NOTIFICATION_COLUMNS}
      FROM notifications
      WHERE external_system_id = ${externalSystemId} AND idempotency_key = ${key}
    `.pipe(mapSqlError("addNotification"));

  const addNotification: NotificationRepoService["addNotification"] =
    Effect.fn("NotificationsRepo.addNotification")(function* (input) {
      const key = input.idempotency_key ?? null;

      const insert = Effect.gen(function* () {
        // replay of an already-accepted request: return it, plan nothing new
        if (key !== null) {
          const existing = yield* findByIdempotencyKey(input.external_system_id, key);
          if (existing[0]) {
            return { _tag: "Replayed", notification: new NotificationRecord(existing[0]) } as const;
          }
        }

        const users = yield* sql<{ id: string }>`
          SELECT id FROM users WHERE id = ${input.user_id} AND deleted_at IS NULL
        `.pipe(mapSqlError("planDeliveries"));
        if (users.length === 0) return { _tag: "UnknownUser" } as const;

        // "" = every channel
        const channels = (input.channels ?? []).join(",");
        const templates = yield* sql<{ channel: string }>`
          SELECT channel::text AS channel
          FROM notification_templates
          WHERE external_system_id = ${input.external_system_id}
            AND event_type = ${input.event_type}
            AND deleted_at IS NULL
            AND (${channels} = '' OR channel::text = ANY(string_to_array(${channels}, ',')))
        `.pipe(mapSqlError("planDeliveries"));
        if (templates.length === 0) return { _tag: "NoTemplates" } as const;

        const rows = yield* sql<NotificationRecord>`
          INSERT INTO notifications (external_system_id, user_id, event_type, payload, idempotency_key)
          VALUES (${input.external_system_id}, ${input.user_id}, ${input.event_type}, ${input.payload}, ${key})
          ON CONFLICT (external_system_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
          RETURNING ${NOTIFICATION_COLUMNS}
        `.pipe(mapSqlError("addNotification"));

        if (!rows[0]) {
          // lost a race with a concurrent request carrying the same key
          const existing = yield* findByIdempotencyKey(input.external_system_id, key ?? "");
          if (!existing[0]) {
            return yield* Effect.fail(
              new NotificationConflict({
                message: `A notification with idempotency key "${key}" could not be created or found`,
              }),
            );
          }
          return { _tag: "Replayed", notification: new NotificationRecord(existing[0]) } as const;
        }

        const notification = new NotificationRecord(rows[0]);

        // One delivery per channel that has a template. Channels the user
        // turned off, or has no usable contact for, are recorded as skipped
        // with the reason, so the dashboard can explain why nothing went out.
        yield* sql`
          INSERT INTO notification_deliveries
            (notification_id, channel, status, recipient, last_error, max_attempts)
          SELECT ${notification.id}, t.channel,
                 CASE
                   WHEN p.enabled = FALSE THEN 'skipped'
                   WHEN c.id IS NULL OR c.address IS NULL OR btrim(c.address) = '' THEN 'skipped'
                   WHEN t.channel = 'telegram' AND NOT c.linked THEN 'skipped'
                   ELSE 'pending'
                 END::delivery_status,
                 c.address,
                 CASE
                   WHEN p.enabled = FALSE THEN 'User turned off ' || t.channel::text || ' notifications'
                   WHEN c.id IS NULL OR c.address IS NULL OR btrim(c.address) = '' THEN 'User has no ' || t.channel::text || ' contact'
                   WHEN t.channel = 'telegram' AND NOT c.linked THEN 'User has not linked Telegram'
                   ELSE NULL
                 END,
                 ${input.max_attempts}
          FROM notification_templates t
          LEFT JOIN user_contacts c
                 ON c.user_id = ${input.user_id} AND c.channel = t.channel AND c.deleted_at IS NULL
          LEFT JOIN user_preferences p
                 ON p.user_id = ${input.user_id} AND p.channel = t.channel
          WHERE t.external_system_id = ${input.external_system_id}
            AND t.event_type = ${input.event_type}
            AND t.deleted_at IS NULL
            AND (${channels} = '' OR t.channel::text = ANY(string_to_array(${channels}, ',')))
          ON CONFLICT DO NOTHING
        `.pipe(mapSqlError("planDeliveries"));

        return { _tag: "Created", notification } as const;
      });

      return yield* sql.withTransaction(insert).pipe(
        Effect.catchTag("SqlError", (error) => Effect.fail(toNotificationRepoError("addNotification", error))),
      );
    });

  // A notification with names and a roll-up of its deliveries.
  const SUMMARY_SELECT = sql.literal(`
    SELECT n.id, n.external_system_id, s.name AS system_name,
           n.user_id, ul.display_name AS user_display_name,
           n.event_type, n.payload, n.idempotency_key, n.created_at,
           COALESCE(d.total, 0)   AS deliveries_total,
           COALESCE(d.sent, 0)    AS deliveries_sent,
           COALESCE(d.failed, 0)  AS deliveries_failed,
           COALESCE(d.active, 0)  AS deliveries_active,
           COALESCE(d.skipped, 0) AS deliveries_skipped,
           COALESCE(d.channels, '{}') AS channels
    FROM notifications n
    JOIN external_systems s ON s.id = n.external_system_id
    JOIN user_labels ul     ON ul.id = n.user_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int                                                   AS total,
             count(*) FILTER (WHERE status = 'sent')::int                    AS sent,
             count(*) FILTER (WHERE status = 'failed')::int                  AS failed,
             count(*) FILTER (WHERE status IN ('pending', 'retrying'))::int  AS active,
             count(*) FILTER (WHERE status IN ('skipped', 'cancelled'))::int AS skipped,
             array_agg(channel::text ORDER BY channel)                       AS channels
      FROM notification_deliveries
      WHERE notification_id = n.id AND deleted_at IS NULL
    ) d ON TRUE
  `);

  const toSummary = (row: Record<string, unknown>) =>
    new NotificationSummary({
      ...(row as unknown as NotificationSummary),
      channels: parsePgArray(row.channels) as NotificationSummary["channels"],
    });

  const findNotificationById: NotificationRepoService["findNotificationById"] =
    Effect.fn("NotificationsRepo.findNotificationById")(function* (id) {
      const rows = yield* sql<Record<string, unknown>>`
        ${SUMMARY_SELECT}
        WHERE n.id = ${id} AND n.deleted_at IS NULL
      `.pipe(mapSqlError("findNotificationById"));

      const row = rows[0];
      return row ? toSummary(row) : null;
    });

  const listNotifications: NotificationRepoService["listNotifications"] =
    Effect.fn("NotificationsRepo.listNotifications")(function* (input) {
      const { skip, limit } = normalizePagination(input);
      const systemId  = input.external_system_id ?? null;
      const userId    = input.user_id ?? null;
      const eventType = input.event_type?.trim() || null;
      const outcome   = input.outcome ?? null;

      const rows = yield* sql<Record<string, unknown>>`
        SELECT *, COUNT(*) OVER()::int AS total_count FROM (
          ${SUMMARY_SELECT}
          WHERE n.deleted_at IS NULL
            AND (${systemId}::uuid IS NULL OR n.external_system_id = ${systemId}::uuid)
            AND (${userId}::uuid   IS NULL OR n.user_id = ${userId}::uuid)
            AND (${eventType}::text IS NULL OR n.event_type = ${eventType}::text)
        ) x
        WHERE ${outcome}::text IS NULL
           OR (${outcome}::text = 'failed' AND x.deliveries_failed > 0)
           OR (${outcome}::text = 'active' AND x.deliveries_active > 0)
           OR (${outcome}::text = 'sent'   AND x.deliveries_sent > 0 AND x.deliveries_failed = 0 AND x.deliveries_active = 0)
        ORDER BY x.created_at DESC, x.id
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listNotifications"));

      return {
        items: rows.map(toSummary),
        total: Number(rows[0]?.total_count ?? 0),
        skip,
        limit,
      };
    });

  // ---------- notification_deliveries ----------

  const DELIVERY_COLUMNS = sql.literal(
    "id, notification_id, channel, provider_id, status, attempt_count, max_attempts, recipient, " +
      "last_error, next_attempt_at, sent_at, created_at, updated_at, deleted_at",
  );

  const listNotificationDeliveries: NotificationRepoService["listNotificationDeliveries"] =
    Effect.fn("NotificationsRepo.listNotificationDeliveries")(function* (
      notificationId,
      input,
    ) {
      const { skip, limit } = normalizePagination(input);

      const rows = yield* sql<
        NotificationDeliveryRecord & { readonly total_count: number }
      >`
        SELECT ${DELIVERY_COLUMNS},
               COUNT(*) OVER()::int AS total_count
        FROM notification_deliveries
        WHERE notification_id = ${notificationId} AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listNotificationDeliveries"));

      return {
        items: rows.map((row) => new NotificationDeliveryRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
    });

  const updateNotificationDeliveryStatus: NotificationRepoService["updateNotificationDeliveryStatus"] =
    Effect.fn("NotificationsRepo.updateNotificationDeliveryStatus")(
      function* (id, input) {
        const rows = yield* sql<NotificationDeliveryRecord>`
          UPDATE notification_deliveries
          SET
            status = ${input.status},
            last_error = COALESCE(${input.last_error ?? null}, last_error),
            sent_at = COALESCE(${input.sent_at ?? null}, sent_at),
            attempt_count = attempt_count + 1,
            updated_at = now()
          WHERE id = ${id} AND deleted_at IS NULL
          RETURNING ${DELIVERY_COLUMNS}
        `.pipe(mapSqlError("updateNotificationDeliveryStatus"));

        const row = rows[0];
        return row ? new NotificationDeliveryRecord(row) : null;
      },
    );

  return {
    addNotificationTemplate,
    findNotificationTemplateById,
    listNotificationTemplates,
    updateNotificationTemplate,
    deleteNotificationTemplate,
    addNotification,
    findNotificationById,
    listNotifications,
    listNotificationDeliveries,
    updateNotificationDeliveryStatus,
  };
}
