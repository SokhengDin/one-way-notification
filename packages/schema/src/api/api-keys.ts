import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { ApiKeyRecord, IssuedApiKey } from "../api-keys/api-keys";
import { ApiKeyInvalid, ApiKeyLimitReached, ApiKeyNotFound, ApiKeyRepoError } from "../api-keys/api-keys.errors";
import { Unauthorized } from "../auth/auth.errors";
import { ExternalSystemNotFound, ExternalSystemRepoError } from "../external-systems/external-systems.errors";
import { Uuid } from "../shared/ids";
import { ApiResponse } from "./response";

// Issued from the dashboard (signed-in administrator only). External systems
// send with the key in the X-Api-Key header.
export class ApiKeysApiGroup extends HttpApiGroup.make("api-keys")
  .add(
    HttpApiEndpoint.get("listApiKeys", "/external-system/:externalSystemId/api-key", {
      params:  { externalSystemId: Uuid },
      query:   { include_inactive: Schema.optional(Schema.Literals(["true", "false"])) },
      success: ApiResponse(Schema.Array(ApiKeyRecord)),
      error:   [ExternalSystemNotFound, ExternalSystemRepoError, ApiKeyRepoError],
    }),
    HttpApiEndpoint.post("issueApiKey", "/external-system/:externalSystemId/api-key", {
      params:  { externalSystemId: Uuid },
      payload: Schema.Struct({
        name:            Schema.String,
        /** 1 to 730 days */
        expires_in_days: Schema.Int,
      }),
      success: ApiResponse(IssuedApiKey),
      error:   [ExternalSystemNotFound, ExternalSystemRepoError, ApiKeyInvalid, ApiKeyLimitReached, ApiKeyRepoError, Unauthorized],
    }),
    HttpApiEndpoint.post("revokeApiKey", "/api-key/:id/revoke", {
      params:  { id: Uuid },
      success: ApiResponse(ApiKeyRecord),
      error:   [ApiKeyNotFound, ApiKeyInvalid, ApiKeyRepoError, Unauthorized],
    }),
    HttpApiEndpoint.post("rollApiKey", "/api-key/:id/roll", {
      params:  { id: Uuid },
      payload: Schema.Struct({
        /** how long the old key keeps working: 0 (revoked now), 1, 24 or 168 hours */
        grace_hours:     Schema.Int,
        /** expiry of the replacement, 1 to 730 days */
        expires_in_days: Schema.Int,
      }),
      success: ApiResponse(IssuedApiKey),
      error:   [ApiKeyNotFound, ApiKeyInvalid, ApiKeyLimitReached, ApiKeyRepoError, Unauthorized],
    }),
  )
  .prefix("/api")
{}
