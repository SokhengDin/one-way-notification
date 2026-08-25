import { Schema } from "effect";
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
import { ApiResponse } from "./response";

export class ExternalSystemsApiGroup extends HttpApiGroup.make(
  "external-systems",
)
  .add(
    // ---------- external_systems ----------
    HttpApiEndpoint.get("listExternalSystems", "/external-system", {
      success: ApiResponse(Schema.Array(ExternalSystemRecord)),
      error: ExternalSystemRepoError,
    }),
    HttpApiEndpoint.post("addExternalSystem", "/external-system", {
      payload: Schema.Struct({
        name: Schema.String,
        api_key: Schema.String,
      }),
      success: ApiResponse(ExternalSystemRecord),
      error: [ExternalSystemConflict, ExternalSystemRepoError],
    }),
    HttpApiEndpoint.get("getExternalSystemById", "/external-system/:id", {
      params: { id: Schema.String },
      success: ApiResponse(ExternalSystemRecord),
      error: [ExternalSystemNotFound, ExternalSystemRepoError],
    }),
    HttpApiEndpoint.patch("updateExternalSystem", "/external-system/:id", {
      params: { id: Schema.String },
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
        api_key: Schema.optional(Schema.String),
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
        params: { id: Schema.String },
        success: HttpApiSchema.NoContent,
        error: [ExternalSystemNotFound, ExternalSystemRepoError],
      },
    ),

    // ---------- external_user_links ----------
    HttpApiEndpoint.get(
      "listExternalUserLinksByUser",
      "/external-system/user/:userId/link",
      {
        params: { userId: Schema.String },
        success: ApiResponse(Schema.Array(ExternalUserLinkRecord)),
        error: ExternalSystemRepoError,
      },
    ),
    HttpApiEndpoint.post(
      "addExternalUserLink",
      "/external-system/:externalSystemId/link",
      {
        params: { externalSystemId: Schema.String },
        payload: Schema.Struct({
          external_user_id: Schema.String,
          user_id: Schema.String,
        }),
        success: ApiResponse(ExternalUserLinkRecord),
        error: [ExternalUserLinkConflict, ExternalSystemRepoError],
      },
    ),
    HttpApiEndpoint.make("DELETE")(
      "deleteExternalUserLink",
      "/external-system/link/:id",
      {
        params: { id: Schema.String },
        success: HttpApiSchema.NoContent,
        error: [ExternalUserLinkNotFound, ExternalSystemRepoError],
      },
    ),
  )
  .prefix("/api")
{}
