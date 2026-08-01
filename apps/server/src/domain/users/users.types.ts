import type { Effect } from "effect";
import type {
  ChannelType,
  UserContactRecord,
  UserPreferenceRecord,
  UserRecord,
  UsersError,
} from "@repo/schema";

export interface AddUser {}

export interface AddUserPreference {
  readonly user_id: string;
  readonly channel: ChannelType;
  readonly enabled: boolean;
}

export interface AddUserContacts {
  readonly user_id: string;
  readonly channel: ChannelType;
  readonly address: string | null;
  readonly linked: boolean;
  readonly verified: boolean;
}

export interface UpdateUserContact {
  readonly address?: string | null;
  readonly linked?: boolean;
  readonly verified?: boolean;
}

export interface UserRepoService {
  readonly addUser: (input: AddUser) => Effect.Effect<UserRecord>;

  readonly getUserById: (
    id: string,
  ) => Effect.Effect<UserRecord, UsersError>;

  readonly listUsers: () => Effect.Effect<ReadonlyArray<UserRecord>>;

  readonly deleteUser: (id: string) => Effect.Effect<void, UsersError>;

  readonly listUserContacts: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<UserContactRecord>>;

  readonly getUserContact: (
    userId: string,
    channel: ChannelType,
  ) => Effect.Effect<UserContactRecord, UsersError>;

  readonly addUserContact: (
    input: AddUserContacts,
  ) => Effect.Effect<UserContactRecord, UsersError>;

  readonly updateUserContact: (
    userId: string,
    channel: ChannelType,
    input: UpdateUserContact,
  ) => Effect.Effect<UserContactRecord, UsersError>;

  readonly listUserPreferences: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<UserPreferenceRecord>>;

  readonly setUserPreference: (
    input: AddUserPreference,
  ) => Effect.Effect<UserPreferenceRecord>;
}
