import type { Effect } from "effect";
import type {
  ChannelType,
  UserContactConflict,
  UserContactNotFound,
  UserContactRecord,
  UserNotFound,
  UserPreferenceRecord,
  UserRecord,
  UserRepoError,
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
  readonly addUser: (
    input: AddUser,
  ) => Effect.Effect<UserRecord, UserRepoError>;

  readonly findUserById: (
    id: string,
  ) => Effect.Effect<UserRecord | null, UserRepoError>;

  readonly listUsers: () => Effect.Effect<
    ReadonlyArray<UserRecord>,
    UserRepoError
  >;

  readonly deleteUser: (id: string) => Effect.Effect<boolean, UserRepoError>;

  readonly listUserContacts: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<UserContactRecord>, UserRepoError>;

  readonly findUserContact: (
    userId: string,
    channel: ChannelType,
  ) => Effect.Effect<UserContactRecord | null, UserRepoError>;

  readonly addUserContact: (
    input: AddUserContacts,
  ) => Effect.Effect<UserContactRecord, UserRepoError | UserContactConflict>;

  readonly updateUserContact: (
    userId: string,
    channel: ChannelType,
    input: UpdateUserContact,
  ) => Effect.Effect<UserContactRecord | null, UserRepoError>;

  readonly listUserPreferences: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<UserPreferenceRecord>, UserRepoError>;

  readonly setUserPreference: (
    input: AddUserPreference,
  ) => Effect.Effect<UserPreferenceRecord, UserRepoError>;
}

export interface UsersService {
  readonly addUser: (
    input: AddUser,
  ) => Effect.Effect<UserRecord, UserRepoError>;

  readonly getUserById: (
    id: string,
  ) => Effect.Effect<UserRecord, UserRepoError | UserNotFound>;

  readonly listUsers: () => Effect.Effect<
    ReadonlyArray<UserRecord>,
    UserRepoError
  >;

  readonly deleteUser: (
    id: string,
  ) => Effect.Effect<void, UserRepoError | UserNotFound>;

  readonly listUserContacts: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<UserContactRecord>, UserRepoError>;

  readonly getUserContact: (
    userId: string,
    channel: ChannelType,
  ) => Effect.Effect<UserContactRecord, UserRepoError | UserContactNotFound>;

  readonly addUserContact: (
    input: AddUserContacts,
  ) => Effect.Effect<UserContactRecord, UserRepoError | UserContactConflict>;

  readonly updateUserContact: (
    userId: string,
    channel: ChannelType,
    input: UpdateUserContact,
  ) => Effect.Effect<UserContactRecord, UserRepoError | UserContactNotFound>;

  readonly listUserPreferences: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<UserPreferenceRecord>, UserRepoError>;

  readonly setUserPreference: (
    input: AddUserPreference,
  ) => Effect.Effect<UserPreferenceRecord, UserRepoError>;
}
