import type { Effect } from "effect";
import type {
  ChannelProviderConflict,
  ChannelProviderNotFound,
  ChannelProviderRecord,
  ChannelType,
  PaginatedResult,
  PaginationInput,
  ProviderRepoError,
  ProviderUsageLogRecord,
} from "@repo/schema";

// ---------- channel_providers ----------

export interface AddChannelProvider {
  readonly channel: ChannelType;
  readonly name: string;
  readonly is_active?: boolean;
}

export interface UpdateChannelProvider {
  readonly name?: string;
  readonly is_active?: boolean;
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
    input: AddChannelProvider,
  ) => Effect.Effect<
    ChannelProviderRecord,
    ProviderRepoError | ChannelProviderConflict
  >;

  readonly findChannelProviderById: (
    id: string,
  ) => Effect.Effect<ChannelProviderRecord | null, ProviderRepoError>;

  readonly listChannelProviders: (
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<ChannelProviderRecord>,
    ProviderRepoError
  >;

  readonly updateChannelProvider: (
    id: string,
    input: UpdateChannelProvider,
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
 * Service layer: wraps the repo and turns its null results into the
 * flat domain errors declared on the API endpoints.
 */
export interface ProvidersService {
  // channel_providers
  readonly addChannelProvider: (
    input: AddChannelProvider,
  ) => Effect.Effect<
    ChannelProviderRecord,
    ProviderRepoError | ChannelProviderConflict
  >;

  readonly getChannelProviderById: (
    id: string,
  ) => Effect.Effect<
    ChannelProviderRecord,
    ProviderRepoError | ChannelProviderNotFound
  >;

  readonly listChannelProviders: (
    input: PaginationInput,
  ) => Effect.Effect<
    PaginatedResult<ChannelProviderRecord>,
    ProviderRepoError
  >;

  readonly updateChannelProvider: (
    id: string,
    input: UpdateChannelProvider,
  ) => Effect.Effect<
    ChannelProviderRecord,
    ProviderRepoError | ChannelProviderNotFound | ChannelProviderConflict
  >;

  readonly deleteChannelProvider: (
    id: string,
  ) => Effect.Effect<void, ProviderRepoError | ChannelProviderNotFound>;

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
