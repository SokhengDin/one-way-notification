import { runApi } from "../api-client";

export const listApiKeys = (externalSystemId: string, includeInactive: boolean) =>
  runApi((client) =>
    client["api-keys"].listApiKeys({
      params: { externalSystemId },
      query:  { include_inactive: includeInactive ? "true" : "false" },
    }),
  );

export const issueApiKey = (externalSystemId: string, payload: { name: string; expires_in_days: number }) =>
  runApi((client) => client["api-keys"].issueApiKey({ params: { externalSystemId }, payload }));

export const revokeApiKey = (id: string) =>
  runApi((client) => client["api-keys"].revokeApiKey({ params: { id } }));

export const rollApiKey = (id: string, payload: { grace_hours: number; expires_in_days: number }) =>
  runApi((client) => client["api-keys"].rollApiKey({ params: { id }, payload }));
