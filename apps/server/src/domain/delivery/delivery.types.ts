import type { Effect } from "effect";
import type {
  ChannelType,
  DeliveryAttempt,
  DeliveryListItem,
  DeliveryNotFound,
  DeliveryQueueStats,
  DeliveryRepoError,
  DeliveryStateConflict,
  DeliveryStatus,
  BulkRetryResult,
  DeliveryDetail,
  PaginatedResult,
  PaginationInput,
} from "@repo/schema";

export interface ListDeliveriesInput extends PaginationInput {
  readonly status?:             DeliveryStatus;
  readonly channel?:            ChannelType;
  readonly provider_id?:        string;
  readonly external_system_id?: string;
  readonly notification_id?:    string;
  readonly q?:                  string;
}

/** A delivery a worker has leased and must now process. */
export interface ClaimedDelivery {
  readonly id:                 string;
  readonly notification_id:    string;
  readonly channel:            ChannelType;
  readonly recipient:          string | null;
  readonly attempt_count:      number;
  readonly max_attempts:       number;
  readonly external_system_id: string;
  readonly event_type:         string;
  readonly payload:            Record<string, unknown>;
  /** null when the template was deleted after fan-out */
  readonly template_id:        string | null;
}

export interface ProviderCandidate {
  readonly id:   string;
  readonly name: string;
}

export interface RecordAttempt {
  readonly delivery_id:     string;
  readonly provider_id:     string;
  readonly success:         boolean;
  readonly status_code:     number | null;
  readonly error:           string | null;
  readonly provider_ref_id: string | null;
  readonly raw_response:    Record<string, unknown> | null;
  readonly duration_ms:     number;
  /** whether this failure should count toward the provider's circuit breaker */
  readonly trips_breaker:   boolean;
}

export type DeliveryOutcome =
  | { readonly _tag: "Sent";   readonly providerId: string }
  | { readonly _tag: "Retry";  readonly providerId: string | null; readonly error: string; readonly delayMs: number }
  | { readonly _tag: "Failed"; readonly providerId: string | null; readonly error: string };

export type RetryResult =
  | { readonly _tag: "Ok"; readonly item: DeliveryListItem }
  | { readonly _tag: "NotFound" }
  | { readonly _tag: "Conflict"; readonly message: string };

export interface DeliveryRepoService {
  readonly listDeliveries: (
    input: ListDeliveriesInput,
  ) => Effect.Effect<PaginatedResult<DeliveryListItem>, DeliveryRepoError>;

  readonly findDelivery: (id: string) => Effect.Effect<DeliveryListItem | null, DeliveryRepoError>;

  readonly listAttempts: (deliveryId: string) => Effect.Effect<ReadonlyArray<DeliveryAttempt>, DeliveryRepoError>;

  readonly queueStats: (workerEnabled: boolean) => Effect.Effect<DeliveryQueueStats, DeliveryRepoError>;

  /** Lease up to `limit` due deliveries for this worker. */
  readonly claimDue: (
    workerId:     string,
    limit:        number,
    leaseSeconds: number,
  ) => Effect.Effect<ReadonlyArray<ClaimedDelivery>, DeliveryRepoError>;

  /** Active, configured providers for a channel, healthiest and lowest priority first. */
  readonly providersFor: (channel: ChannelType) => Effect.Effect<ReadonlyArray<ProviderCandidate>, DeliveryRepoError>;

  /** Log the attempt and update the provider's health, together. */
  readonly recordAttempt: (input: RecordAttempt) => Effect.Effect<void, DeliveryRepoError>;

  /** Finish a claimed delivery. No-op if this worker no longer holds the lease. */
  readonly complete: (
    deliveryId: string,
    workerId:   string,
    outcome:    DeliveryOutcome,
  ) => Effect.Effect<boolean, DeliveryRepoError>;

  readonly retry: (id: string, extraAttempts: number) => Effect.Effect<RetryResult, DeliveryRepoError>;

  readonly cancel: (id: string) => Effect.Effect<RetryResult, DeliveryRepoError>;

  readonly retryFailed: (
    filter:        { readonly channel?: ChannelType; readonly provider_id?: string },
    extraAttempts: number,
  ) => Effect.Effect<number, DeliveryRepoError>;
}

export interface ProcessSummary {
  readonly claimed:  number;
  readonly sent:     number;
  readonly retrying: number;
  readonly failed:   number;
}

export interface DeliveriesService {
  readonly listDeliveries: (
    input: ListDeliveriesInput,
  ) => Effect.Effect<PaginatedResult<DeliveryListItem>, DeliveryRepoError>;

  readonly getDelivery: (id: string) => Effect.Effect<DeliveryDetail, DeliveryRepoError | DeliveryNotFound>;

  readonly getQueue: Effect.Effect<DeliveryQueueStats, DeliveryRepoError>;

  readonly retryDelivery: (
    id: string,
  ) => Effect.Effect<DeliveryListItem, DeliveryRepoError | DeliveryNotFound | DeliveryStateConflict>;

  readonly cancelDelivery: (
    id: string,
  ) => Effect.Effect<DeliveryListItem, DeliveryRepoError | DeliveryNotFound | DeliveryStateConflict>;

  readonly retryFailed: (filter: {
    readonly channel?:     ChannelType;
    readonly provider_id?: string;
  }) => Effect.Effect<BulkRetryResult, DeliveryRepoError>;

  /** Claim and process one batch of due deliveries. Never fails. */
  readonly processDue: (workerId: string) => Effect.Effect<ProcessSummary>;
}
