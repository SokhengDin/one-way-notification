import { Schema } from "effect";
import { Uuid } from "../shared/ids";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import {
  ExternalSystemRecord,
  ExternalUserLinkRecord,
  SystemUserRecord,
} from "../external-systems/external-systems";
import {
  ExternalSystemConflict,
  ExternalSystemNotFound,
  ExternalSystemRepoError,
  ExternalUserLinkConflict,
  ExternalUserLinkNotFound,
  SystemUserInvalid,
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

    // ---------- users under a system ----------
    HttpApiEndpoint.get("listSystemUsers", "/external-system/:externalSystemId/user", {
      params: { externalSystemId: Uuid },
      query: {
        ...PaginationQuery,
        // name, email or their id in this system
        q: Schema.optional(Schema.String),
      },
      success: ApiResponse(PaginatedData(SystemUserRecord)),
      error: [ExternalSystemNotFound, ExternalSystemRepoError],
    }),
    HttpApiEndpoint.post("addSystemUser", "/external-system/:externalSystemId/user", {
      params: { externalSystemId: Uuid },
      // creates the user, puts them under this system and adds their contacts
      payload: Schema.Struct({
        external_user_id: Schema.String,
        name:             Schema.optional(Schema.NullOr(Schema.String)),
        email:            Schema.optional(Schema.NullOr(Schema.String)),
        phone:            Schema.optional(Schema.NullOr(Schema.String)),
        telegram_chat_id: Schema.optional(Schema.NullOr(Schema.String)),
      }),
      success: ApiResponse(SystemUserRecord),
      error: [ExternalSystemNotFound, ExternalUserLinkConflict, SystemUserInvalid, ExternalSystemRepoError],
    }),

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
