import { Schema } from "effect";

export const NotificationRepoOperation = Schema.Literals([
  // notification_templates
  "addNotificationTemplate",
  "findNotificationTemplateById",
  "listNotificationTemplates",
  "updateNotificationTemplate",
  "deleteNotificationTemplate",
  // notifications
  "addNotification",
  "findNotificationById",
  "listNotifications",
  // notification_deliveries
  "addNotificationDelivery",
  "listNotificationDeliveries",
  "updateNotificationDeliveryStatus",
  // rendering: loading the external system + its brand assets
  "loadTemplateBranding",
]);

export type NotificationRepoOperation = typeof NotificationRepoOperation.Type;

export class NotificationRepoError extends Schema.TaggedErrorClass<NotificationRepoError>()(
  "NotificationRepoError",
  {
    message: Schema.String,
    operation: NotificationRepoOperation,
    sqlState: Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

export class NotificationTemplateNotFound extends Schema.TaggedErrorClass<NotificationTemplateNotFound>()(
  "NotificationTemplateNotFound",
  {
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class NotificationTemplateConflict extends Schema.TaggedErrorClass<NotificationTemplateConflict>()(
  "NotificationTemplateConflict",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class NotificationNotFound extends Schema.TaggedErrorClass<NotificationNotFound>()(
  "NotificationNotFound",
  {
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class NotificationConflict extends Schema.TaggedErrorClass<NotificationConflict>()(
  "NotificationConflict",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class NotificationDeliveryNotFound extends Schema.TaggedErrorClass<NotificationDeliveryNotFound>()(
  "NotificationDeliveryNotFound",
  {
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

// The template body or subject is unusable: syntax error, missing required
// subject for email, or it references an external system that doesn't exist.
export class NotificationTemplateInvalid extends Schema.TaggedErrorClass<NotificationTemplateInvalid>()(
  "NotificationTemplateInvalid",
  {
    message: Schema.String,
    issues:  Schema.optionalKey(Schema.Array(Schema.String)),
  },
  { httpApiStatus: 422 },
) {}
