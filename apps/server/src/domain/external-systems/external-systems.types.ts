import type { Effect } from "effect";
import type {
  ExternalSystemConflict,
  ExternalSystemNotFound,
  ExternalSystemRecord,
  ExternalSystemRepoError,
  ExternalUserLinkConflict,
  ExternalUserLinkNotFound,
  ExternalUserLinkRecord,
  PaginatedResult,
  PaginationInput,
  SystemUserInvalid,
  SystemUserRecord,
} from "@repo/schema";

// ---------- external_systems ----------

export interface AddExternalSystem {
  readonly name: string;
}

export interface UpdateExternalSystem {
  readonly name?: string;
}

export interface ListExternalSystemsInput extends PaginationInput {
  readonly name?: string;
}

// ---------- external_user_links ----------

export interface AddExternalUserLink {
  readonly external_system_id: string;
  readonly external_user_id: string;
  readonly user_id: string;
}

// ---------- users under a system ----------

export interface ListSystemUsersInput extends PaginationInput {
  readonly q?: string;
}

/** already trimmed and checked */
export interface AddSystemUser {
  readonly external_user_id: string;
  readonly name:             string | null;
  readonly email:            string | null;
  readonly phone:            string | null;
  readonly telegram:         string | null;
}

export interface AddSystemUserInput {
  readonly external_user_id:  string;
  readonly name?:             string | null;
  readonly email?:            string | null;
  readonly phone?:            string | null;
  readonly telegram_chat_id?: string | null;
}

export interface ExternalSystemRepoService {
  readonly listSystemUsers: (
    externalSystemId: string,
    input: ListSystemUsersInput,
  ) => Effect.Effect<PaginatedResult<SystemUserRecord>, ExternalSystemRepoError>;

  readonly addSystemUser: (
    externalSystemId: string,
    input: AddSystemUser,
  ) => Effect.Effect<SystemUserRecord, ExternalSystemRepoError | ExternalUserLinkConflict>;

  // external_systems
  readonly addExternalSystem: (
    input: AddExternalSystem,
  ) => Effect.Effect<
    ExternalSystemRecord,
    ExternalSystemRepoError | ExternalSystemConflict
  >;

  readonly findExternalSystemById: (
    id: string,
  ) => Effect.Effect<ExternalSystemRecord | null, ExternalSystemRepoError>;

  readonly listExternalSystems: (
    input: ListExternalSystemsInput,
  ) => Effect.Effect<
    PaginatedResult<ExternalSystemRecord>,
    ExternalSystemRepoError
  >;

  readonly updateExternalSystem: (
    id: string,
    input: UpdateExternalSystem,
  ) => Effect.Effect<
    ExternalSystemRecord | null,
    ExternalSystemRepoError | ExternalSystemConflict
  >;

  readonly deleteExternalSystem: (
    id: string,
  ) => Effect.Effect<boolean, ExternalSystemRepoError>;

  // external_user_links
  readonly addExternalUserLink: (
    input: AddExternalUserLink,
  ) => Effect.Effect<
    ExternalUserLinkRecord,
    ExternalSystemRepoError | ExternalUserLinkConflict
  >;

  readonly listExternalUserLinksByUser: (
    userId: string,
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<ExternalUserLinkRecord>,
    ExternalSystemRepoError
  >;

  readonly listExternalUserLinksBySystem: (
    externalSystemId: string,
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<ExternalUserLinkRecord>,
    ExternalSystemRepoError
  >;

  readonly deleteExternalUserLink: (
    id: string,
  ) => Effect.Effect<boolean, ExternalSystemRepoError>;
}

export interface ExternalSystemsService {
  readonly listSystemUsers: (
    externalSystemId: string,
    input: ListSystemUsersInput,
  ) => Effect.Effect<PaginatedResult<SystemUserRecord>, ExternalSystemRepoError | ExternalSystemNotFound>;

  readonly addSystemUser: (
    externalSystemId: string,
    input: AddSystemUserInput,
  ) => Effect.Effect<
    SystemUserRecord,
    ExternalSystemRepoError | ExternalSystemNotFound | ExternalUserLinkConflict | SystemUserInvalid
  >;

  // external_systems
  readonly addExternalSystem: (
    input: AddExternalSystem,
  ) => Effect.Effect<
    ExternalSystemRecord,
    ExternalSystemRepoError | ExternalSystemConflict
  >;

  readonly getExternalSystemById: (
    id: string,
  ) => Effect.Effect<
    ExternalSystemRecord,
    ExternalSystemRepoError | ExternalSystemNotFound
  >;

  readonly listExternalSystems: (
    input: ListExternalSystemsInput,
  ) => Effect.Effect<
    PaginatedResult<ExternalSystemRecord>,
    ExternalSystemRepoError
  >;

  readonly updateExternalSystem: (
    id: string,
    input: UpdateExternalSystem,
  ) => Effect.Effect<
    ExternalSystemRecord,
    ExternalSystemRepoError | ExternalSystemNotFound | ExternalSystemConflict
  >;

  readonly deleteExternalSystem: (
    id: string,
  ) => Effect.Effect<
    void,
    ExternalSystemRepoError | ExternalSystemNotFound
  >;

  // external_user_links
  readonly addExternalUserLink: (
    input: AddExternalUserLink,
  ) => Effect.Effect<
    ExternalUserLinkRecord,
    ExternalSystemRepoError | ExternalUserLinkConflict
  >;

  readonly listExternalUserLinksByUser: (
    userId: string,
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<ExternalUserLinkRecord>,
    ExternalSystemRepoError
  >;

  readonly listExternalUserLinksBySystem: (
    externalSystemId: string,
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<ExternalUserLinkRecord>,
    ExternalSystemRepoError
  >;

  readonly deleteExternalUserLink: (
    id: string,
  ) => Effect.Effect<
    void,
    ExternalSystemRepoError | ExternalUserLinkNotFound
  >;
}
