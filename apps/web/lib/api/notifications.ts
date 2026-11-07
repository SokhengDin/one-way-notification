import type { ChannelType, DeliveryStatus } from "@repo/schema";
import { runApi } from "../api-client";

// ---------- notification_templates ----------

export const listNotificationTemplates = (query: {
  skip?: number;
  limit?: number;
  external_system_id?: string;
}) =>
  runApi((client) => client.notifications.listNotificationTemplates({ query }));

export const addNotificationTemplate = (payload: {
  external_system_id: string;
  event_type: string;
  channel: ChannelType;
  template: string;
  subject: string | null;
}) =>
  runApi((client) =>
    client.notifications.addNotificationTemplate({ payload }),
  );

export const getNotificationTemplateById = (id: string) =>
  runApi((client) =>
    client.notifications.getNotificationTemplateById({ params: { id } }),
  );

export const updateNotificationTemplate = (
  id: string,
  payload: { template?: string; subject?: string | null },
) =>
  runApi((client) =>
    client.notifications.updateNotificationTemplate({
      params: { id },
      payload,
    }),
  );

export const deleteNotificationTemplate = (id: string) =>
  runApi((client) =>
    client.notifications.deleteNotificationTemplate({ params: { id } }),
  );

// ---------- notifications ----------

export const listNotifications = (query: { skip?: number; limit?: number }) =>
  runApi((client) => client.notifications.listNotifications({ query }));

export const addNotification = (payload: {
  external_system_id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key?: string | null;
}) => runApi((client) => client.notifications.addNotification({ payload }));

export const getNotificationById = (id: string) =>
  runApi((client) =>
    client.notifications.getNotificationById({ params: { id } }),
  );

// ---------- notification_deliveries ----------

export const listNotificationDeliveries = (
  notificationId: string,
  query: { skip?: number; limit?: number },
) =>
  runApi((client) =>
    client.notifications.listNotificationDeliveries({
      params: { notificationId },
      query,
    }),
  );

export const updateNotificationDeliveryStatus = (
  id: string,
  payload: {
    status: DeliveryStatus;
    last_error?: string | null;
    sent_at?: string | null;
  },
) =>
  runApi((client) =>
    client.notifications.updateNotificationDeliveryStatus({
      params: { id },
      payload,
    }),
  );

// ---------- rendering ----------

export const renderNotificationTemplate = (id: string, payload: Record<string, unknown>) =>
  runApi((client) =>
    client.notifications.renderNotificationTemplate({
      params: { id },
      payload: { payload },
    }),
  );

export const previewNotificationTemplate = (payload: {
  external_system_id: string;
  channel: ChannelType;
  template: string;
  subject: string | null;
  payload: Record<string, unknown>;
}) =>
  runApi((client) =>
    client.notifications.previewNotificationTemplate({ payload }),
  );
