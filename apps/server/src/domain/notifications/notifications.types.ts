import type { Effect } from "effect";
import type {
  ChannelType,
  DeliveryStatus,
  NotificationConflict,
  NotificationDeliveryNotFound,
  NotificationDeliveryRecord,
  NotificationNotFound,
  NotificationRecord,
  NotificationRepoError,
  NotificationTemplateConflict,
  NotificationTemplateNotFound,
  NotificationTemplateRecord,
} from "@repo/schema";

// ---------- notification_templates ----------
export interface AddNotificationTemplate {
  readonly external_system_id: string;
  readonly event_type: string;
  readonly channel: ChannelType;
  readonly template: string;
  readonly subject: string | null;
}

export interface UpdateNotificationTemplate {
  readonly template?: string;
  readonly subject?: string | null;
}

// ---------- notifications ----------

export interface AddNotification {
  readonly external_system_id: string;
  readonly user_id: string;
  readonly event_type: string;
  readonly payload: Record<string, unknown>;
  readonly idempotency_key?: string | null;
}

// ---------- notification_deliveries ----------

export interface UpdateNotificationDeliveryStatus {
  readonly status: DeliveryStatus;
  readonly last_error?: string | null;
  readonly sent_at?: string | null;
}

export interface NotificationRepoService {
  // notification_templates
  readonly addNotificationTemplate: (
    input: AddNotificationTemplate,
  ) => Effect.Effect<
    NotificationTemplateRecord,
    NotificationRepoError | NotificationTemplateConflict
  >;

  readonly findNotificationTemplateById: (
    id: string,
  ) => Effect.Effect<NotificationTemplateRecord | null, NotificationRepoError>;

  readonly listNotificationTemplates: () => Effect.Effect<
    ReadonlyArray<NotificationTemplateRecord>,
    NotificationRepoError
  >;

  readonly updateNotificationTemplate: (
    id: string,
    input: UpdateNotificationTemplate,
  ) => Effect.Effect<NotificationTemplateRecord | null, NotificationRepoError>;

  readonly deleteNotificationTemplate: (
    id: string,
  ) => Effect.Effect<boolean, NotificationRepoError>;

  // notifications
  readonly addNotification: (
    input: AddNotification,
  ) => Effect.Effect<
    NotificationRecord,
    NotificationRepoError | NotificationConflict
  >;

  readonly findNotificationById: (
    id: string,
  ) => Effect.Effect<NotificationRecord | null, NotificationRepoError>;

  readonly listNotifications: () => Effect.Effect<
    ReadonlyArray<NotificationRecord>,
    NotificationRepoError
  >;

  // notification_deliveries
  readonly listNotificationDeliveries: (
    notificationId: string,
  ) => Effect.Effect<
    ReadonlyArray<NotificationDeliveryRecord>,
    NotificationRepoError
  >;

  readonly updateNotificationDeliveryStatus: (
    id: string,
    input: UpdateNotificationDeliveryStatus,
  ) => Effect.Effect<
    NotificationDeliveryRecord | null,
    NotificationRepoError
  >;
}


export interface NotificationsService {
  // notification_templates
  readonly addNotificationTemplate: (
    input: AddNotificationTemplate,
  ) => Effect.Effect<
    NotificationTemplateRecord,
    NotificationRepoError | NotificationTemplateConflict
  >;

  readonly getNotificationTemplateById: (
    id: string,
  ) => Effect.Effect<
    NotificationTemplateRecord,
    NotificationRepoError | NotificationTemplateNotFound
  >;

  readonly listNotificationTemplates: () => Effect.Effect<
    ReadonlyArray<NotificationTemplateRecord>,
    NotificationRepoError
  >;

  readonly updateNotificationTemplate: (
    id: string,
    input: UpdateNotificationTemplate,
  ) => Effect.Effect<
    NotificationTemplateRecord,
    NotificationRepoError | NotificationTemplateNotFound
  >;

  readonly deleteNotificationTemplate: (
    id: string,
  ) => Effect.Effect<
    void,
    NotificationRepoError | NotificationTemplateNotFound
  >;

  // notifications
  readonly addNotification: (
    input: AddNotification,
  ) => Effect.Effect<
    NotificationRecord,
    NotificationRepoError | NotificationConflict
  >;

  readonly getNotificationById: (
    id: string,
  ) => Effect.Effect<
    NotificationRecord,
    NotificationRepoError | NotificationNotFound
  >;

  readonly listNotifications: () => Effect.Effect<
    ReadonlyArray<NotificationRecord>,
    NotificationRepoError
  >;

  // notification_deliveries
  readonly listNotificationDeliveries: (
    notificationId: string,
  ) => Effect.Effect<
    ReadonlyArray<NotificationDeliveryRecord>,
    NotificationRepoError
  >;

  readonly updateNotificationDeliveryStatus: (
    id: string,
    input: UpdateNotificationDeliveryStatus,
  ) => Effect.Effect<
    NotificationDeliveryRecord,
    NotificationRepoError | NotificationDeliveryNotFound
  >;
}
