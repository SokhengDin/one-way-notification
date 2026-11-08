import type { ChannelType, ProviderConfigValue } from "@repo/schema";
import { runApi } from "../api-client";

// ---------- channel_providers ----------

export const listChannelProviders = (query: {
  skip?: number;
  limit?: number;
  channel?: ChannelType;
}) => runApi((client) => client.providers.listChannelProviders({ query }));

export const addChannelProvider = (payload: {
  channel: ChannelType;
  name: string;
  kind: string;
  is_active?: boolean;
  priority?: number;
  config: Record<string, ProviderConfigValue>;
  secrets?: Record<string, string>;
}) => runApi((client) => client.providers.addChannelProvider({ payload }));

export const getChannelProviderById = (id: string) =>
  runApi((client) =>
    client.providers.getChannelProviderById({ params: { id } }),
  );

export const updateChannelProvider = (
  id: string,
  payload: {
    name?: string;
    is_active?: boolean;
    priority?: number;
    config?: Record<string, ProviderConfigValue>;
    /** string sets, null clears, omitted keeps */
    secrets?: Record<string, string | null>;
  },
) =>
  runApi((client) =>
    client.providers.updateChannelProvider({ params: { id }, payload }),
  );

export const deleteChannelProvider = (id: string) =>
  runApi((client) =>
    client.providers.deleteChannelProvider({ params: { id } }),
  );

export const testChannelProvider = (id: string, payload: { to: string; message?: string }) =>
  runApi((client) =>
    client.providers.testChannelProvider({ params: { id }, payload }),
  );

export const resetChannelProviderHealth = (id: string) =>
  runApi((client) =>
    client.providers.resetChannelProviderHealth({ params: { id } }),
  );

// ---------- provider_usage_log ----------

export const listProviderUsageLogByDelivery = (
  deliveryId: string,
  query: { skip?: number; limit?: number },
) =>
  runApi((client) =>
    client.providers.listProviderUsageLogByDelivery({
      params: { deliveryId },
      query,
    }),
  );

export const addProviderUsageLog = (payload: {
  delivery_id: string;
  provider_id: string;
  provider_ref_id?: string | null;
  status_code?: number | null;
  cost?: string | null;
  raw_response?: Record<string, unknown> | null;
}) => runApi((client) => client.providers.addProviderUsageLog({ payload }));
