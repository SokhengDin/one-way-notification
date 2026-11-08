import { Schema } from "effect";
import { Uuid } from "../shared/ids";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { channelTypeSchema, deliveryStatusSchema } from "../enums";
import {
  NotificationDeliveryRecord,
  NotificationRecord,
  NotificationSummary,
  NotificationTemplateRecord,
  RenderedTemplate,
} from "../notifications/notifications";
import {
  NotificationDeliveryNotFound,
  NotificationConflict,
  NotificationNotFound,
  NotificationRepoError,
  NotificationTemplateConflict,
  NotificationTemplateInvalid,
  NotificationTemplateNotFound,
  NotificationUndeliverable,
} from "../notifications/notifications.errors";
import { PaginatedData, PaginationQuery } from "../shared/pagination";
import { Unauthorized } from "../auth/auth.errors";
import { ApiResponse } from "./response";

export class NotificationsApiGroup extends HttpApiGroup.make("notifications")
  .add(
    // ---------- notification_templates ----------
    HttpApiEndpoint.get("listNotificationTemplates", "/notification-template", {
      query: {
        ...PaginationQuery,
        external_system_id: Schema.optional(Uuid),
        channel: Schema.optional(channelTypeSchema),
        // matches event type or subject (case-insensitive)
        q: Schema.optional(Schema.String),
      },
      success: ApiResponse(PaginatedData(NotificationTemplateRecord)),
      error: NotificationRepoError,
    }),
    HttpApiEndpoint.post("addNotificationTemplate", "/notification-template", {
      payload: Schema.Struct({
        external_system_id: Uuid,
        event_type: Schema.String,
        channel: channelTypeSchema,
        template: Schema.String,
        subject: Schema.NullOr(Schema.String),
      }),
      success: ApiResponse(NotificationTemplateRecord),
      error: [NotificationTemplateConflict, NotificationTemplateInvalid, NotificationRepoError],
    }),
    HttpApiEndpoint.get("getNotificationTemplateById", "/notification-template/:id", {
      params: { id: Uuid },
      success: ApiResponse(NotificationTemplateRecord),
      error: [NotificationTemplateNotFound, NotificationRepoError],
    }),
    HttpApiEndpoint.patch("updateNotificationTemplate", "/notification-template/:id", {
      params: { id: Uuid },
      payload: Schema.Struct({
        template: Schema.optional(Schema.String),
        subject: Schema.optional(Schema.NullOr(Schema.String)),
      }),
      success: ApiResponse(NotificationTemplateRecord),
      error: [NotificationTemplateNotFound, NotificationTemplateInvalid, NotificationRepoError],
    }),
    HttpApiEndpoint.make("DELETE")("deleteNotificationTemplate", "/notification-template/:id", {
      params: { id: Uuid },
      success: HttpApiSchema.NoContent,
      error: [NotificationTemplateNotFound, NotificationRepoError],
    }),
    // Render a saved template against a sample payload (dashboard preview,
    // or a sender checking output before going live).
    HttpApiEndpoint.post("renderNotificationTemplate", "/notification-template/:id/render", {
      params: { id: Uuid },
      payload: Schema.Struct({
        payload: Schema.Record(Schema.String, Schema.Unknown),
      }),
      success: ApiResponse(RenderedTemplate),
      error: [NotificationTemplateNotFound, NotificationTemplateInvalid, NotificationRepoError],
    }),
    // Render an unsaved draft — used by the "new template" preview.
    HttpApiEndpoint.post("previewNotificationTemplate", "/notification-template/preview", {
      payload: Schema.Struct({
        external_system_id: Uuid,
        channel: channelTypeSchema,
        template: Schema.String,
        subject: Schema.NullOr(Schema.String),
        payload: Schema.Record(Schema.String, Schema.Unknown),
      }),
      success: ApiResponse(RenderedTemplate),
      error: [NotificationTemplateInvalid, NotificationRepoError],
    }),

    // ---------- notifications ----------
    HttpApiEndpoint.get("listNotifications", "/notification", {
      query: {
        ...PaginationQuery,
        external_system_id: Schema.optional(Uuid),
        user_id: Schema.optional(Uuid),
        event_type: Schema.optional(Schema.String),
        // "failed": at least one delivery failed; "active": still sending;
        // "sent": every delivery that could go out did
        outcome: Schema.optional(Schema.Literals(["failed", "active", "sent"])),
      },
      success: ApiResponse(PaginatedData(NotificationSummary)),
      error: NotificationRepoError,
    }),
    HttpApiEndpoint.post("addNotification", "/notification", {
      payload: Schema.Struct({
        external_system_id: Uuid,
        user_id: Uuid,
        event_type: Schema.String,
        payload: Schema.Record(Schema.String, Schema.Unknown),
        idempotency_key: Schema.optional(Schema.NullOr(Schema.String)),
        // limit to these channels; default: every channel with a template
        channels: Schema.optional(Schema.Array(channelTypeSchema)),
      }),
      success: ApiResponse(NotificationRecord),
      error: [NotificationConflict, NotificationUndeliverable, Unauthorized, NotificationRepoError],
    }),
    HttpApiEndpoint.get("getNotificationById", "/notification/:id", {
      params: { id: Uuid },
      success: ApiResponse(NotificationSummary),
      error: [NotificationNotFound, NotificationRepoError],
    }),

    // ---------- notification_deliveries ----------
    HttpApiEndpoint.get(
      "listNotificationDeliveries",
      "/notification/:notificationId/delivery",
      {
        params: { notificationId: Uuid },
        query: PaginationQuery,
        success: ApiResponse(PaginatedData(NotificationDeliveryRecord)),
        error: NotificationRepoError,
      },
    ),
    HttpApiEndpoint.patch(
      "updateNotificationDeliveryStatus",
      "/notification-delivery/:id",
      {
        params: { id: Uuid },
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
