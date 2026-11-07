import type { Effect } from "effect";
import type {
  ChannelProviderConflict,
  ChannelProviderNotFound,
  ChannelProviderRecord,
  ChannelType,
  PaginatedResult,
  PaginationInput,
  ProviderConfigValue,
  ProviderInvalid,
  ProviderRepoError,
  ProviderSecretsUnavailable,
  ProviderUsageLogRecord,
} from "@repo/schema";

// ---------- channel_providers ----------

export type ProviderConfig = Readonly<Record<string, ProviderConfigValue>>;

/** API input for creating a provider. */
export interface AddChannelProvider {
  readonly channel:    ChannelType;
  readonly name:       string;
  readonly kind:       string;
  readonly is_active?: boolean;
  readonly priority?:  number;
  readonly config:     ProviderConfig;
  readonly secrets?:   Readonly<Record<string, string>>;
}

/** API input for updating a provider. */
export interface UpdateChannelProvider {
  readonly name?:      string;
  readonly is_active?: boolean;
  readonly priority?:  number;
  readonly config?:    ProviderConfig;
  /** per field: string sets, null clears, "" or omitted keeps */
  readonly secrets?:   Readonly<Record<string, string | null>>;
}

export interface ListChannelProvidersInput extends PaginationInput {
  readonly channel?: ChannelType;
}

/** What the repo writes — already validated and encrypted by the service. */
export interface InsertChannelProvider {
  readonly id:          string;
  readonly channel:     ChannelType;
  readonly name:        string;
  readonly kind:        string;
  readonly is_active:   boolean;
  readonly priority:    number;
  readonly config:      ProviderConfig;
  readonly secrets:     Uint8Array | null;
  readonly secret_keys: ReadonlyArray<string>;
}

export interface PatchChannelProvider {
  readonly name?:      string;
  readonly is_active?: boolean;
  readonly priority?:  number;
  readonly config?:    ProviderConfig;
  /** present = replace the encrypted blob (null clears it) */
  readonly secrets?:   { readonly blob: Uint8Array | null; readonly keys: ReadonlyArray<string> };
}

/** Internal row incl. the encrypted blob — never leaves the service. */
export interface ProviderWithSecrets {
  readonly record:  ChannelProviderRecord;
  readonly secrets: Uint8Array | null;
}

/** Decrypted settings for whatever actually sends (the future delivery worker). */
export interface ProviderCredentials {
  readonly id:      string;
  readonly channel: ChannelType;
  readonly kind:    string;
  readonly config:  ProviderConfig;
  readonly secrets: Readonly<Record<string, string>>;
}

// ---------- provider_usage_log ----------

export interface AddProviderUsageLog {
  readonly delivery_id: string;
  readonly provider_id: string;
  readonly provider_ref_id?: string | null;
  readonly status_code?: number | null;
  readonly cost?: string | null;
  readonly raw_response?: Record<string, unknown> | null;
}

/**
 * Mechanical data access only. Missing rows come back as null/empty,
 * never as a domain error — callers (the service layer) decide when
 * that means *NotFound.
 */
export interface ProviderRepoService {
  // channel_providers
  readonly addChannelProvider: (
    input: InsertChannelProvider,
  ) => Effect.Effect<
    ChannelProviderRecord,
    ProviderRepoError | ChannelProviderConflict
  >;

  readonly findChannelProviderById: (
    id: string,
  ) => Effect.Effect<ChannelProviderRecord | null, ProviderRepoError>;

  readonly findChannelProviderWithSecrets: (
    id: string,
  ) => Effect.Effect<ProviderWithSecrets | null, ProviderRepoError>;

  readonly listChannelProviders: (
    input: ListChannelProvidersInput,
  ) => Effect.Effect<
    PaginatedResult<ChannelProviderRecord>,
    ProviderRepoError
  >;

  readonly updateChannelProvider: (
    id: string,
    input: PatchChannelProvider,
  ) => Effect.Effect<
    ChannelProviderRecord | null,
    ProviderRepoError | ChannelProviderConflict
  >;

  readonly deleteChannelProvider: (
    id: string,
  ) => Effect.Effect<boolean, ProviderRepoError>;

  // provider_usage_log
  readonly addProviderUsageLog: (
    input: AddProviderUsageLog,
  ) => Effect.Effect<ProviderUsageLogRecord, ProviderRepoError>;

  readonly listProviderUsageLogByDelivery: (
    deliveryId: string,
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<ProviderUsageLogRecord>,
    ProviderRepoError
  >;
}

/**
 * Service layer: validates configuration against the provider catalog,
 * encrypts credentials, and turns repo nulls into domain errors.
 */
export interface ProvidersService {
  // channel_providers
  readonly addChannelProvider: (
    input: AddChannelProvider,
  ) => Effect.Effect<
    ChannelProviderRecord,
    ProviderRepoError | ChannelProviderConflict | ProviderInvalid | ProviderSecretsUnavailable
  >;

  readonly getChannelProviderById: (
    id: string,
  ) => Effect.Effect<
    ChannelProviderRecord,
    ProviderRepoError | ChannelProviderNotFound
  >;

  readonly listChannelProviders: (
    input: ListChannelProvidersInput,
  ) => Effect.Effect<
    PaginatedResult<ChannelProviderRecord>,
    ProviderRepoError
  >;

  readonly updateChannelProvider: (
    id: string,
    input: UpdateChannelProvider,
  ) => Effect.Effect<
    ChannelProviderRecord,
    | ProviderRepoError
    | ChannelProviderNotFound
    | ChannelProviderConflict
    | ProviderInvalid
    | ProviderSecretsUnavailable
  >;

  readonly deleteChannelProvider: (
    id: string,
  ) => Effect.Effect<void, ProviderRepoError | ChannelProviderNotFound>;

  /** Decrypted config + credentials. Not exposed over HTTP. */
  readonly resolveProviderCredentials: (
    id: string,
  ) => Effect.Effect<
    ProviderCredentials,
    ProviderRepoError | ChannelProviderNotFound | ProviderInvalid | ProviderSecretsUnavailable
  >;

  // provider_usage_log
  readonly addProviderUsageLog: (
    input: AddProviderUsageLog,
  ) => Effect.Effect<ProviderUsageLogRecord, ProviderRepoError>;

  readonly listProviderUsageLogByDelivery: (
    deliveryId: string,
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<ProviderUsageLogRecord>,
    ProviderRepoError
  >;
}
