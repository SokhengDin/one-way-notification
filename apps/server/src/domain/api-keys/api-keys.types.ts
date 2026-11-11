import type {
  ApiKeyInvalid,
  ApiKeyLimitReached,
  ApiKeyNotFound,
  ApiKeyRecord,
  ApiKeyRepoError,
  ExternalSystemNotFound,
  ExternalSystemRepoError,
  IssuedApiKey,
} from "@repo/schema";
import type { Effect } from "effect";

export interface InsertApiKey {
  readonly external_system_id: string;
  readonly name:               string;
  readonly prefix:             string;
  readonly last_four:          string;
  readonly key_hash:           string;
  readonly created_by:         string;
  readonly expires_in_days:    number;
}

export interface ApiKeysRepoService {
  readonly insertApiKey:        (input: InsertApiKey) => Effect.Effect<ApiKeyRecord, ApiKeyRepoError>;
  readonly listApiKeys:         (externalSystemId: string, includeInactive: boolean) => Effect.Effect<ReadonlyArray<ApiKeyRecord>, ApiKeyRepoError>;
  readonly findApiKeyById:      (id: string) => Effect.Effect<ApiKeyRecord | null, ApiKeyRepoError>;
  readonly revokeApiKey:        (id: string, adminId: string) => Effect.Effect<ApiKeyRecord | null, ApiKeyRepoError>;
  /** make it expire within `hours` (never later than it already does) */
  readonly shortenApiKey:       (id: string, hours: number) => Effect.Effect<void, ApiKeyRepoError>;
  readonly countActiveApiKeys:  (externalSystemId: string) => Effect.Effect<number, ApiKeyRepoError>;
  readonly findActiveKeyByHash: (keyHash: string) => Effect.Effect<{ readonly id: string; readonly external_system_id: string } | null, ApiKeyRepoError>;
  readonly touchApiKey:         (id: string, ip: string | null) => Effect.Effect<void, ApiKeyRepoError>;
}

export interface IssueInput {
  readonly name:            string;
  readonly expires_in_days: number;
}

export interface RollInput {
  readonly grace_hours:     number;
  readonly expires_in_days: number;
}

export interface ApiKeysService {
  readonly listApiKeys: (
    externalSystemId: string,
    includeInactive:  boolean,
  ) => Effect.Effect<ReadonlyArray<ApiKeyRecord>, ExternalSystemNotFound | ExternalSystemRepoError | ApiKeyRepoError>;

  readonly issueApiKey: (
    externalSystemId: string,
    input:            IssueInput,
    adminId:          string,
  ) => Effect.Effect<IssuedApiKey, ExternalSystemNotFound | ExternalSystemRepoError | ApiKeyInvalid | ApiKeyLimitReached | ApiKeyRepoError>;

  readonly revokeApiKey: (id: string, adminId: string) => Effect.Effect<ApiKeyRecord, ApiKeyNotFound | ApiKeyRepoError>;

  /** issue a replacement with the same name; the old key keeps working for `grace_hours` */
  readonly rollApiKey: (
    id:      string,
    input:   RollInput,
    adminId: string,
  ) => Effect.Effect<IssuedApiKey, ApiKeyNotFound | ApiKeyInvalid | ApiKeyLimitReached | ApiKeyRepoError>;

  /**
   * The external system a key sends for, or null when the key is unknown,
   * malformed, revoked, expired or its system is deleted. All of those look
   * the same to the caller.
   */
  readonly authenticateKey: (key: string, ip: string | null) => Effect.Effect<string | null, ApiKeyRepoError>;
}
