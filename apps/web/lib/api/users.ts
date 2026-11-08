import type { ChannelType } from "@repo/schema";
import { runApi } from "../api-client";

export const listUsers = (query: { skip?: number; limit?: number; q?: string }) =>
  runApi((client) => client.users.listUsers({ query }));

export const addUser = (payload: { name?: string | null } = {}) =>
  runApi((client) => client.users.addUser({ payload }));

export const updateUser = (id: string, payload: { name?: string | null }) =>
  runApi((client) => client.users.updateUser({ params: { id }, payload }));

export const getUserById = (id: string) =>
  runApi((client) => client.users.getUserById({ params: { id } }));

export const deleteUser = (id: string) =>
  runApi((client) => client.users.deleteUser({ params: { id } }));

export const listUserContacts = (
  id: string,
  query: { skip?: number; limit?: number },
) =>
  runApi((client) =>
    client.users.listUserContacts({ params: { id }, query }),
  );

export const addUserContact = (
  id: string,
  payload: {
    channel: ChannelType;
    address: string | null;
    linked: boolean;
    verified: boolean;
  },
) =>
  runApi((client) =>
    client.users.addUserContact({ params: { id }, payload }),
  );

export const getUserContact = (id: string, channel: ChannelType) =>
  runApi((client) =>
    client.users.getUserContact({ params: { id, channel } }),
  );

export const updateUserContact = (
  id: string,
  channel: ChannelType,
  payload: {
    address?: string | null;
    linked?: boolean;
    verified?: boolean;
  },
) =>
  runApi((client) =>
    client.users.updateUserContact({ params: { id, channel }, payload }),
  );

export const listUserPreferences = (
  id: string,
  query: { skip?: number; limit?: number },
) =>
  runApi((client) =>
    client.users.listUserPreferences({ params: { id }, query }),
  );

export const setUserPreference = (
  id: string,
  payload: { channel: ChannelType; enabled: boolean },
) =>
  runApi((client) =>
    client.users.setUserPreference({ params: { id }, payload }),
  );
