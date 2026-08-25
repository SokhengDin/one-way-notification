import {
  makeMapSqlError,
  NotificationConflict,
  NotificationRepoError,
  NotificationTemplateConflict,
  type NotificationDeliveryRecord,
  type NotificationRecord,
  type NotificationRepoOperation,
  type NotificationTemplateRecord,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { NotificationRepoService } from "./notifications.types";

const { toRepoError: toNotificationRepoError, mapSqlError } = makeMapSqlError<
  NotificationRepoOperation,
  NotificationRepoError
>((fields) => new NotificationRepoError(fields), "Failed to query notifications");

export function makeSqlNotificationRepo(
  sql: SqlClient,
): NotificationRepoService {
  // ---------- notification_templates ----------

  const addNotificationTemplate: NotificationRepoService["addNotificationTemplate"] =
    Effect.fn("NotificationsRepo.addNotificationTemplate")(function* (
      input,
    ) {
      const rows = yield* sql<NotificationTemplateRecord>`
        INSERT INTO notification_templates (external_system_id, event_type, channel, template, subject)
        VALUES (${input.external_system_id}, ${input.event_type}, ${input.channel}, ${input.template}, ${input.subject})
        RETURNING id, external_system_id, event_type, channel, template, subject, created_at, updated_at, deleted_at
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

      return rows[0]!;
    });

  const findNotificationTemplateById: NotificationRepoService["findNotificationTemplateById"] =
    Effect.fn("NotificationsRepo.findNotificationTemplateById")(function* (
      id,
    ) {
      const rows = yield* sql<NotificationTemplateRecord>`
        SELECT id, external_system_id, event_type, channel, template, subject, created_at, updated_at, deleted_at
        FROM notification_templates
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(mapSqlError("findNotificationTemplateById"));

      return rows[0] ?? null;
    });

  const listNotificationTemplates: NotificationRepoService["listNotificationTemplates"] =
    Effect.fn("NotificationsRepo.listNotificationTemplates")(function* () {
      return yield* sql<NotificationTemplateRecord>`
        SELECT id, external_system_id, event_type, channel, template, subject, created_at, updated_at, deleted_at
        FROM notification_templates
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
      `.pipe(mapSqlError("listNotificationTemplates"));
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
          subject = COALESCE(${input.subject ?? null}, subject),
          updated_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id, external_system_id, event_type, channel, template, subject, created_at, updated_at, deleted_at
      `.pipe(mapSqlError("updateNotificationTemplate"));

      return rows[0] ?? null;
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

  const addNotification: NotificationRepoService["addNotification"] =
    Effect.fn("NotificationsRepo.addNotification")(function* (input) {
      const rows = yield* sql<NotificationRecord>`
        INSERT INTO notifications (external_system_id, user_id, event_type, payload, idempotency_key)
        VALUES (${input.external_system_id}, ${input.user_id}, ${input.event_type}, ${input.payload}, ${input.idempotency_key ?? null})
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING id, external_system_id, user_id, event_type, payload, idempotency_key, created_at, updated_at, deleted_at
      `.pipe(mapSqlError("addNotification"));

      if (rows[0]) {
        return rows[0];
      }

      const existing = yield* sql<NotificationRecord>`
        SELECT id, external_system_id, user_id, event_type, payload, idempotency_key, created_at, updated_at, deleted_at
        FROM notifications
        WHERE idempotency_key = ${input.idempotency_key ?? null}
      `.pipe(mapSqlError("addNotification"));

      if (!existing[0]) {
        return yield* Effect.fail(
          new NotificationConflict({
            message: `A notification with idempotency key "${input.idempotency_key}" could not be created or found`,
          }),
        );
      }

      return existing[0];
    });

  const findNotificationById: NotificationRepoService["findNotificationById"] =
    Effect.fn("NotificationsRepo.findNotificationById")(function* (id) {
      const rows = yield* sql<NotificationRecord>`
        SELECT id, external_system_id, user_id, event_type, payload, idempotency_key, created_at, updated_at, deleted_at
        FROM notifications
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(mapSqlError("findNotificationById"));

      return rows[0] ?? null;
    });

  const listNotifications: NotificationRepoService["listNotifications"] =
    Effect.fn("NotificationsRepo.listNotifications")(function* () {
      return yield* sql<NotificationRecord>`
        SELECT id, external_system_id, user_id, event_type, payload, idempotency_key, created_at, updated_at, deleted_at
        FROM notifications
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
      `.pipe(mapSqlError("listNotifications"));
    });

  // ---------- notification_deliveries ----------

  const listNotificationDeliveries: NotificationRepoService["listNotificationDeliveries"] =
    Effect.fn("NotificationsRepo.listNotificationDeliveries")(function* (
      notificationId,
    ) {
      return yield* sql<NotificationDeliveryRecord>`
        SELECT id, notification_id, channel, provider_id, status, attempt_count, last_error, sent_at, created_at, updated_at, deleted_at
        FROM notification_deliveries
        WHERE notification_id = ${notificationId} AND deleted_at IS NULL
        ORDER BY created_at ASC
      `.pipe(mapSqlError("listNotificationDeliveries"));
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
          RETURNING id, notification_id, channel, provider_id, status, attempt_count, last_error, sent_at, created_at, updated_at, deleted_at
        `.pipe(mapSqlError("updateNotificationDeliveryStatus"));

        return rows[0] ?? null;
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
