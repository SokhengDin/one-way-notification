import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { channelTypeSchema, deliveryStatusSchema } from "../enums";
import {
  NotificationDeliveryRecord,
  NotificationRecord,
  NotificationTemplateRecord,
} from "../notifications/notifications";
import {
  NotificationDeliveryNotFound,
  NotificationConflict,
  NotificationNotFound,
  NotificationRepoError,
  NotificationTemplateConflict,
  NotificationTemplateNotFound,
} from "../notifications/notifications.errors";
import { PaginatedData, PaginationQuery } from "../shared/pagination";
import { ApiResponse } from "./response";

export class NotificationsApiGroup extends HttpApiGroup.make("notifications")
  .add(
    // ---------- notification_templates ----------
    HttpApiEndpoint.get("listNotificationTemplates", "/notification-template", {
      query: {
        ...PaginationQuery,
        external_system_id: Schema.optional(Schema.String),
      },
      success: ApiResponse(PaginatedData(NotificationTemplateRecord)),
      error: NotificationRepoError,
    }),
    HttpApiEndpoint.post("addNotificationTemplate", "/notification-template", {
      payload: Schema.Struct({
        external_system_id: Schema.String,
        event_type: Schema.String,
        channel: channelTypeSchema,
        template: Schema.String,
        subject: Schema.NullOr(Schema.String),
      }),
      success: ApiResponse(NotificationTemplateRecord),
      error: [NotificationTemplateConflict, NotificationRepoError],
    }),
    HttpApiEndpoint.get("getNotificationTemplateById", "/notification-template/:id", {
      params: { id: Schema.String },
      success: ApiResponse(NotificationTemplateRecord),
      error: [NotificationTemplateNotFound, NotificationRepoError],
    }),
    HttpApiEndpoint.patch("updateNotificationTemplate", "/notification-template/:id", {
      params: { id: Schema.String },
      payload: Schema.Struct({
        template: Schema.optional(Schema.String),
        subject: Schema.optional(Schema.NullOr(Schema.String)),
      }),
      success: ApiResponse(NotificationTemplateRecord),
      error: [NotificationTemplateNotFound, NotificationRepoError],
    }),
    HttpApiEndpoint.make("DELETE")("deleteNotificationTemplate", "/notification-template/:id", {
      params: { id: Schema.String },
      success: HttpApiSchema.NoContent,
      error: [NotificationTemplateNotFound, NotificationRepoError],
    }),

    // ---------- notifications ----------
    HttpApiEndpoint.get("listNotifications", "/notification", {
      query: PaginationQuery,
      success: ApiResponse(PaginatedData(NotificationRecord)),
      error: NotificationRepoError,
    }),
    HttpApiEndpoint.post("addNotification", "/notification", {
      payload: Schema.Struct({
        external_system_id: Schema.String,
        user_id: Schema.String,
        event_type: Schema.String,
        payload: Schema.Record(Schema.String, Schema.Unknown),
        idempotency_key: Schema.optional(Schema.NullOr(Schema.String)),
      }),
      success: ApiResponse(NotificationRecord),
      error: [NotificationConflict, NotificationRepoError],
    }),
    HttpApiEndpoint.get("getNotificationById", "/notification/:id", {
      params: { id: Schema.String },
      success: ApiResponse(NotificationRecord),
      error: [NotificationNotFound, NotificationRepoError],
    }),

    // ---------- notification_deliveries ----------
    HttpApiEndpoint.get(
      "listNotificationDeliveries",
      "/notification/:notificationId/delivery",
      {
        params: { notificationId: Schema.String },
        query: PaginationQuery,
        success: ApiResponse(PaginatedData(NotificationDeliveryRecord)),
        error: NotificationRepoError,
      },
    ),
    HttpApiEndpoint.patch(
      "updateNotificationDeliveryStatus",
      "/notification-delivery/:id",
      {
        params: { id: Schema.String },
        payload: Schema.Struct({
          status: deliveryStatusSchema,
          last_error: Schema.optional(Schema.NullOr(Schema.String)),
          sent_at: Schema.optional(Schema.NullOr(Schema.String)),
        }),
        success: ApiResponse(NotificationDeliveryRecord),
        error: [NotificationDeliveryNotFound, NotificationRepoError],
      },
    ),
  )
  .prefix("/api")
{}
