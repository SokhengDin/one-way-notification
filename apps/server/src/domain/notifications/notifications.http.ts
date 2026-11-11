import { Api, ok, Unauthorized } from "@repo/schema";
import { Effect, Layer, Option } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ApiKeys } from "../api-keys/api-keys";
import { Notifications } from "./notifications";

export const NotificationsApiHandlers = HttpApiBuilder.group(
  Api,
  "notifications",
  Effect.fn(function* (handlers) {
    const notifications = yield* Notifications;
    const apiKeys       = yield* ApiKeys;

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
      .handle("renderNotificationTemplate", ({ params, payload }) =>
        notifications
          .renderNotificationTemplate(params.id, payload.payload)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("previewNotificationTemplate", ({ payload }) =>
        notifications
          .previewNotificationTemplate(payload)
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
        Effect.gen(function* () {
          // External systems authenticate with their API key; the auth
          // middleware only lets a key-less request through for a signed-in
          // administrator (the dashboard's "New notification").
          const request = yield* HttpServerRequest.HttpServerRequest;
          const headers = request.headers as Readonly<Record<string, string | undefined>>;
          const apiKey  = headers["x-api-key"];
          if (apiKey !== undefined) {
            const ip     = headers["x-forwarded-for"]?.split(",")[0]?.trim() || Option.getOrNull(request.remoteAddress);
            const system = yield* apiKeys.authenticateKey(apiKey.trim(), ip ?? null).pipe(
              Effect.mapError(() => new Unauthorized({ message: "Could not check the API key. Try again." })),
            );
            // unknown, revoked, expired and another system's key all answer the same
            if (system === null || system !== payload.external_system_id) {
              return yield* new Unauthorized({ message: "X-Api-Key is not valid for this external system" });
            }
          }
          const data = yield* notifications.addNotification(payload);
          return ok(data, 201, "Created");
        }),
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
).pipe(Layer.provide([Notifications.layer, ApiKeys.layer]));
