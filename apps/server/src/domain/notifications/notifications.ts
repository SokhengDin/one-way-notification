import {
  NotificationDeliveryNotFound,
  NotificationNotFound,
  NotificationTemplateNotFound,
} from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { makeSqlNotificationRepo } from "./notifications.sql";
import type {
  NotificationRepoService as NotificationRepoServiceShape,
  NotificationsService,
} from "./notifications.types";

export class NotificationsRepo extends Context.Service<
  NotificationsRepo,
  NotificationRepoServiceShape
>()("app/domain/notifications/NotificationsRepo") {
  static readonly layer = Layer.effect(
    NotificationsRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlNotificationRepo(sql);
    }),
  );
}

export class Notifications extends Context.Service<
  Notifications,
  NotificationsService
>()("app/domain/notifications/Notifications") {
  static readonly layer = Layer.effect(
    Notifications,
    Effect.gen(function* () {
      const repo = yield* NotificationsRepo;

      // ---------- notification_templates ----------

      const addNotificationTemplate: NotificationsService["addNotificationTemplate"] =
        Effect.fn("Notifications.addNotificationTemplate")(function* (
          input,
        ) {
          return yield* repo.addNotificationTemplate(input);
        });

      const getNotificationTemplateById: NotificationsService["getNotificationTemplateById"] =
        Effect.fn("Notifications.getNotificationTemplateById")(function* (
          id,
        ) {
          const template = yield* repo.findNotificationTemplateById(id);
          if (template === null) {
            return yield* new NotificationTemplateNotFound({ id });
          }
          return template;
        });

      const listNotificationTemplates: NotificationsService["listNotificationTemplates"] =
        Effect.fn("Notifications.listNotificationTemplates")(function* () {
          return yield* repo.listNotificationTemplates();
        });

      const updateNotificationTemplate: NotificationsService["updateNotificationTemplate"] =
        Effect.fn("Notifications.updateNotificationTemplate")(function* (
          id,
          input,
        ) {
          const template = yield* repo.updateNotificationTemplate(id, input);
          if (template === null) {
            return yield* new NotificationTemplateNotFound({ id });
          }
          return template;
        });

      const deleteNotificationTemplate: NotificationsService["deleteNotificationTemplate"] =
        Effect.fn("Notifications.deleteNotificationTemplate")(function* (
          id,
        ) {
          const deleted = yield* repo.deleteNotificationTemplate(id);
          if (!deleted) {
            return yield* new NotificationTemplateNotFound({ id });
          }
        });

      // ---------- notifications ----------

      const addNotification: NotificationsService["addNotification"] =
        Effect.fn("Notifications.addNotification")(function* (input) {
          return yield* repo.addNotification(input);
        });

      const getNotificationById: NotificationsService["getNotificationById"] =
        Effect.fn("Notifications.getNotificationById")(function* (id) {
          const notification = yield* repo.findNotificationById(id);
          if (notification === null) {
            return yield* new NotificationNotFound({ id });
          }
          return notification;
        });

      const listNotifications: NotificationsService["listNotifications"] =
        Effect.fn("Notifications.listNotifications")(function* () {
          return yield* repo.listNotifications();
        });

      // ---------- notification_deliveries ----------

      const listNotificationDeliveries: NotificationsService["listNotificationDeliveries"] =
        Effect.fn("Notifications.listNotificationDeliveries")(function* (
          notificationId,
        ) {
          return yield* repo.listNotificationDeliveries(notificationId);
        });

      const updateNotificationDeliveryStatus: NotificationsService["updateNotificationDeliveryStatus"] =
        Effect.fn("Notifications.updateNotificationDeliveryStatus")(
          function* (id, input) {
            const delivery = yield* repo.updateNotificationDeliveryStatus(
              id,
              input,
            );
            if (delivery === null) {
              return yield* new NotificationDeliveryNotFound({ id });
            }
            return delivery;
          },
        );

      return {
        addNotificationTemplate,
        getNotificationTemplateById,
        listNotificationTemplates,
        updateNotificationTemplate,
        deleteNotificationTemplate,
        addNotification,
        getNotificationById,
        listNotifications,
        listNotificationDeliveries,
        updateNotificationDeliveryStatus,
      };
    }),
  ).pipe(Layer.provide(NotificationsRepo.layer));
}
