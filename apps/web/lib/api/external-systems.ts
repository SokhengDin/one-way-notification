import { runApi } from "../api-client";

// ---------- external_systems ----------

export const listExternalSystems = (query: {
  skip?: number;
  limit?: number;
  name?: string;
}) =>
  runApi((client) =>
    client["external-systems"].listExternalSystems({ query }),
  );

export const addExternalSystem = (payload: { name: string }) =>
  runApi((client) =>
    client["external-systems"].addExternalSystem({ payload }),
  );

export const getExternalSystemById = (id: string) =>
  runApi((client) =>
    client["external-systems"].getExternalSystemById({ params: { id } }),
  );

export const updateExternalSystem = (
  id: string,
  payload: { name?: string },
) =>
  runApi((client) =>
    client["external-systems"].updateExternalSystem({
      params: { id },
      payload,
    }),
  );

export const deleteExternalSystem = (id: string) =>
  runApi((client) =>
    client["external-systems"].deleteExternalSystem({ params: { id } }),
  );

// ---------- external_user_links ----------

export const listExternalUserLinksByUser = (
  userId: string,
  query: { skip?: number; limit?: number },
) =>
  runApi((client) =>
    client["external-systems"].listExternalUserLinksByUser({
      params: { userId },
      query,
    }),
  );

export const listExternalUserLinksBySystem = (
  externalSystemId: string,
  query: { skip?: number; limit?: number },
) =>
  runApi((client) =>
    client["external-systems"].listExternalUserLinksBySystem({
      params: { externalSystemId },
      query,
    }),
  );

export const addExternalUserLink = (
  externalSystemId: string,
  payload: { external_user_id: string; user_id: string },
) =>
  runApi((client) =>
    client["external-systems"].addExternalUserLink({
      params: { externalSystemId },
      payload,
    }),
  );

export const deleteExternalUserLink = (id: string) =>
  runApi((client) =>
    client["external-systems"].deleteExternalUserLink({ params: { id } }),
  );
