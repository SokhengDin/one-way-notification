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
  NotificationSummary,
  NotificationUndeliverable,
  Unauthorized,
  NotificationTemplateConflict,
  NotificationTemplateInvalid,
  NotificationTemplateNotFound,
  NotificationTemplateRecord,
  RenderedTemplate,
  PaginatedResult,
  PaginationInput,
} from "@repo/schema";

// ---------- notification_templates ----------
export interface AddNotificationTemplate {
  readonly external_system_id: string;
  readonly event_type: string;
  readonly channel: ChannelType;
  readonly template: string;
  readonly subject: string | null;
}

export interface ListNotificationTemplatesInput extends PaginationInput {
  readonly external_system_id?: string;
  readonly channel?: ChannelType;
  /** matches event type or subject */
  readonly q?: string;
}

export interface UpdateNotificationTemplate {
  readonly template?: string;
  readonly subject?: string | null;
}

export interface PreviewNotificationTemplate {
  readonly external_system_id: string;
  readonly channel: ChannelType;
  readonly template: string;
  readonly subject: string | null;
  readonly payload: Record<string, unknown>;
}

// ---------- notifications ----------

export interface AddNotification {
  readonly external_system_id: string;
  readonly user_id: string;
  readonly event_type: string;
  readonly payload: Record<string, unknown>;
  readonly idempotency_key?: string | null;
  /** limit fan-out to these channels; default: every channel with a template */
  readonly channels?: ReadonlyArray<ChannelType>;
}

export interface InsertNotification extends AddNotification {
  /** attempt budget for the deliveries this creates */
  readonly max_attempts: number;
}

/** What the repo did with an insert; the service turns problems into errors. */
export type InsertNotificationResult =
  | { readonly _tag: "Created"; readonly notification: NotificationRecord }
  | { readonly _tag: "Replayed"; readonly notification: NotificationRecord }
  | { readonly _tag: "UnknownUser" }
  | { readonly _tag: "NoTemplates" };

export interface ListNotificationsInput extends PaginationInput {
  readonly external_system_id?: string;
  readonly user_id?: string;
  readonly event_type?: string;
  readonly outcome?: "failed" | "active" | "sent";
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

  readonly listNotificationTemplates: (
    input: ListNotificationTemplatesInput,
  ) => Effect.Effect<
    PaginatedResult<NotificationTemplateRecord>,
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
  /** Insert the notification and plan one delivery per channel, atomically. */
  readonly addNotification: (
    input: InsertNotification,
  ) => Effect.Effect<
    InsertNotificationResult,
    NotificationRepoError | NotificationConflict
  >;

  readonly findNotificationById: (
    id: string,
  ) => Effect.Effect<NotificationSummary | null, NotificationRepoError>;

  readonly listNotifications: (
    input: ListNotificationsInput,
  ) => Effect.Effect<
    PaginatedResult<NotificationSummary>,
    NotificationRepoError
  >;

  // notification_deliveries
  readonly listNotificationDeliveries: (
    notificationId: string,
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<NotificationDeliveryRecord>,
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
    NotificationRepoError | NotificationTemplateConflict | NotificationTemplateInvalid
  >;

  readonly getNotificationTemplateById: (
    id: string,
  ) => Effect.Effect<
    NotificationTemplateRecord,
    NotificationRepoError | NotificationTemplateNotFound
  >;

  readonly listNotificationTemplates: (
    input: ListNotificationTemplatesInput,
  ) => Effect.Effect<
    PaginatedResult<NotificationTemplateRecord>,
    NotificationRepoError
  >;

  readonly updateNotificationTemplate: (
    id: string,
    input: UpdateNotificationTemplate,
  ) => Effect.Effect<
    NotificationTemplateRecord,
    NotificationRepoError | NotificationTemplateNotFound | NotificationTemplateInvalid
  >;

  readonly renderNotificationTemplate: (
    id: string,
    payload: Record<string, unknown>,
  ) => Effect.Effect<
    RenderedTemplate,
    NotificationRepoError | NotificationTemplateNotFound | NotificationTemplateInvalid
  >;

  /**
   * Load a template and its system's branding once, get back a renderer for
   * many payloads (the delivery worker renders a batch with one lookup).
   */
  readonly prepareRenderer: (
    id: string,
  ) => Effect.Effect<
    (payload: Record<string, unknown>) => Effect.Effect<RenderedTemplate, NotificationTemplateInvalid>,
    NotificationRepoError | NotificationTemplateNotFound | NotificationTemplateInvalid
  >;

  readonly previewNotificationTemplate: (
    input: PreviewNotificationTemplate,
  ) => Effect.Effect<
    RenderedTemplate,
    NotificationRepoError | NotificationTemplateInvalid
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
    NotificationRepoError | NotificationConflict | NotificationUndeliverable
  >;

  /** Fails with Unauthorized unless `apiKey` is this external system's key. */
  readonly verifySystemApiKey: (
    externalSystemId: string,
    apiKey: string,
  ) => Effect.Effect<void, NotificationRepoError | Unauthorized>;

  readonly getNotificationById: (
    id: string,
  ) => Effect.Effect<
    NotificationSummary,
    NotificationRepoError | NotificationNotFound
  >;

  readonly listNotifications: (
    input: ListNotificationsInput,
  ) => Effect.Effect<
    PaginatedResult<NotificationSummary>,
    NotificationRepoError
  >;

  // notification_deliveries
  readonly listNotificationDeliveries: (
    notificationId: string,
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<NotificationDeliveryRecord>,
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
