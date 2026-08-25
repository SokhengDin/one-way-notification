import { Api, ok } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Notifications } from "./notifications";

export const NotificationsApiHandlers = HttpApiBuilder.group(
  Api,
  "notifications",
  Effect.fn(function* (handlers) {
    const notifications = yield* Notifications;

    return handlers
      // ---------- notification_templates ----------
      .handle("listNotificationTemplates", ({ query }) =>
        notifications
          .listNotificationTemplates(query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("addNotificationTemplate", ({ payload }) =>
        notifications
          .addNotificationTemplate(payload)
          .pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("getNotificationTemplateById", ({ params }) =>
        notifications
          .getNotificationTemplateById(params.id)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("updateNotificationTemplate", ({ params, payload }) =>
        notifications
          .updateNotificationTemplate(params.id, payload)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("deleteNotificationTemplate", ({ params }) =>
        notifications.deleteNotificationTemplate(params.id),
      )
      // ---------- notifications ----------
      .handle("listNotifications", ({ query }) =>
        notifications
          .listNotifications(query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("addNotification", ({ payload }) =>
        notifications
          .addNotification(payload)
          .pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("getNotificationById", ({ params }) =>
        notifications
          .getNotificationById(params.id)
          .pipe(Effect.map((data) => ok(data))),
      )
      // ---------- notification_deliveries ----------
      .handle("listNotificationDeliveries", ({ params, query }) =>
        notifications
          .listNotificationDeliveries(params.notificationId, query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("updateNotificationDeliveryStatus", ({ params, payload }) =>
        notifications
          .updateNotificationDeliveryStatus(params.id, payload)
          .pipe(Effect.map((data) => ok(data))),
      );
  }),
).pipe(Layer.provide(Notifications.layer));
