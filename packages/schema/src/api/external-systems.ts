import { Schema } from "effect";
import { Uuid } from "../shared/ids";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import {
  ExternalSystemRecord,
  ExternalUserLinkRecord,
} from "../external-systems/external-systems";
import {
  ExternalSystemConflict,
  ExternalSystemNotFound,
  ExternalSystemRepoError,
  ExternalUserLinkConflict,
  ExternalUserLinkNotFound,
} from "../external-systems/external-systems.errors";
import { PaginatedData, PaginationQuery } from "../shared/pagination";
import { ApiResponse } from "./response";

export class ExternalSystemsApiGroup extends HttpApiGroup.make(
  "external-systems",
)
  .add(
    // ---------- external_systems ----------
    HttpApiEndpoint.get("listExternalSystems", "/external-system", {
      query: {
        ...PaginationQuery,
        name: Schema.optional(Schema.String),
      },
      success: ApiResponse(PaginatedData(ExternalSystemRecord)),
      error: ExternalSystemRepoError,
    }),
    HttpApiEndpoint.post("addExternalSystem", "/external-system", {
      // API keys are issued separately (POST /external-system/:id/api-key)
      payload: Schema.Struct({
        name: Schema.String,
      }),
      success: ApiResponse(ExternalSystemRecord),
      error: [ExternalSystemConflict, ExternalSystemRepoError],
    }),
    HttpApiEndpoint.get("getExternalSystemById", "/external-system/:id", {
      params: { id: Uuid },
      success: ApiResponse(ExternalSystemRecord),
      error: [ExternalSystemNotFound, ExternalSystemRepoError],
    }),
    HttpApiEndpoint.patch("updateExternalSystem", "/external-system/:id", {
      params: { id: Uuid },
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
      }),
      success: ApiResponse(ExternalSystemRecord),
      error: [
        ExternalSystemNotFound,
        ExternalSystemConflict,
        ExternalSystemRepoError,
      ],
    }),
    HttpApiEndpoint.make("DELETE")(
      "deleteExternalSystem",
      "/external-system/:id",
      {
        params: { id: Uuid },
        success: HttpApiSchema.NoContent,
        error: [ExternalSystemNotFound, ExternalSystemRepoError],
      },
    ),

    // ---------- external_user_links ----------
    HttpApiEndpoint.get(
      "listExternalUserLinksByUser",
      "/external-system/user/:userId/link",
      {
        params: { userId: Uuid },
        query: PaginationQuery,
        success: ApiResponse(PaginatedData(ExternalUserLinkRecord)),
        error: ExternalSystemRepoError,
      },
    ),
    HttpApiEndpoint.get(
      "listExternalUserLinksBySystem",
      "/external-system/:externalSystemId/link",
      {
        params: { externalSystemId: Uuid },
        query: PaginationQuery,
        success: ApiResponse(PaginatedData(ExternalUserLinkRecord)),
        error: ExternalSystemRepoError,
      },
    ),
    HttpApiEndpoint.post(
      "addExternalUserLink",
      "/external-system/:externalSystemId/link",
      {
        params: { externalSystemId: Uuid },
        payload: Schema.Struct({
          external_user_id: Schema.String,
          user_id: Uuid,
        }),
        success: ApiResponse(ExternalUserLinkRecord),
        error: [ExternalUserLinkConflict, ExternalSystemRepoError],
      },
    ),
    HttpApiEndpoint.make("DELETE")(
      "deleteExternalUserLink",
      "/external-system/link/:id",
      {
        params: { id: Uuid },
        success: HttpApiSchema.NoContent,
        error: [ExternalUserLinkNotFound, ExternalSystemRepoError],
      },
    ),
  )
  .prefix("/api")
{}
