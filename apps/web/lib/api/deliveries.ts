import type { ChannelType, DeliveryStatus } from "@repo/schema";
import { runApi } from "../api-client";

export interface DeliveryFilters {
  skip?:               number;
  limit?:              number;
  status?:             DeliveryStatus;
  channel?:            ChannelType;
  provider_id?:        string;
  external_system_id?: string;
  notification_id?:    string;
  q?:                  string;
}

export const listDeliveries = (query: DeliveryFilters) =>
  runApi((client) => client.deliveries.listDeliveries({ query }));

export const getDeliveryQueue = () =>
  runApi((client) => client.deliveries.getDeliveryQueue());

export const getDelivery = (id: string) =>
  runApi((client) => client.deliveries.getDelivery({ params: { id } }));

export const retryDelivery = (id: string) =>
  runApi((client) => client.deliveries.retryDelivery({ params: { id } }));

export const cancelDelivery = (id: string) =>
  runApi((client) => client.deliveries.cancelDelivery({ params: { id } }));

export const retryFailedDeliveries = (payload: { channel?: ChannelType; provider_id?: string } = {}) =>
  runApi((client) => client.deliveries.retryFailedDeliveries({ payload }));

export const processDueDeliveries = () =>
  runApi((client) => client.deliveries.processDueDeliveries());
