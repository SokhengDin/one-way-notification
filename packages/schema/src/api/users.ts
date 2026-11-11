import { Schema } from "effect";
import { Uuid } from "../shared/ids";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { channelTypeSchema } from "../enums";
import {
  UserContactRecord,
  UserPreferenceRecord,
  UserRecord,
} from "../users/users";
import {
  UserContactConflict,
  UserContactNotFound,
  UserNotFound,
  UserRepoError,
} from "../users/users.errors";
import { PaginatedData, PaginationQuery } from "../shared/pagination";
import { ApiResponse } from "./response";

export class UsersApiGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("listUsers", "/", {
      query: {
        ...PaginationQuery,
        // matches name, email or linked external user id (case-insensitive)
        q: Schema.optional(Schema.String),
        // only the users under this external system
        external_system_id: Schema.optional(Uuid),
      },
      success: ApiResponse(PaginatedData(UserRecord)),
      error: UserRepoError,
    }),
    HttpApiEndpoint.post("addUser", "/", {
      payload: Schema.Struct({
        name: Schema.optional(Schema.NullOr(Schema.String)),
      }),
      success: ApiResponse(UserRecord),
      error: UserRepoError,
    }),
    HttpApiEndpoint.patch("updateUser", "/:id", {
      params: { id: Uuid },
      payload: Schema.Struct({
        // null or "" clears it
        name: Schema.optional(Schema.NullOr(Schema.String)),
      }),
      success: ApiResponse(UserRecord),
      error: [UserNotFound, UserRepoError],
    }),
    HttpApiEndpoint.get("getUserById", "/:id", {
      params: { id: Uuid },
      success: ApiResponse(UserRecord),
      error: [UserNotFound, UserRepoError],
    }),
    HttpApiEndpoint.make("DELETE")("deleteUser", "/:id", {
      params: { id: Uuid },
      success: HttpApiSchema.NoContent,
      error: [UserNotFound, UserRepoError],
    }),
    HttpApiEndpoint.get("listUserContacts", "/:id/contacts", {
      params: { id: Uuid },
      query: PaginationQuery,
      success: ApiResponse(PaginatedData(UserContactRecord)),
      error: UserRepoError,
    }),
    HttpApiEndpoint.post("addUserContact", "/:id/contacts", {
      params: { id: Uuid },
      payload: Schema.Struct({
        channel: channelTypeSchema,
        address: Schema.NullOr(Schema.String),
        linked: Schema.Boolean,
        verified: Schema.Boolean,
      }),
      success: ApiResponse(UserContactRecord),
      error: [UserContactConflict, UserRepoError],
    }),
    HttpApiEndpoint.get("getUserContact", "/:id/contacts/:channel", {
      params: { id: Uuid, channel: channelTypeSchema },
      success: ApiResponse(UserContactRecord),
      error: [UserContactNotFound, UserRepoError],
    }),
    HttpApiEndpoint.patch("updateUserContact", "/:id/contacts/:channel", {
      params: { id: Uuid, channel: channelTypeSchema },
      payload: Schema.Struct({
        address: Schema.optional(Schema.NullOr(Schema.String)),
        linked: Schema.optional(Schema.Boolean),
        verified: Schema.optional(Schema.Boolean),
      }),
      success: ApiResponse(UserContactRecord),
      error: [UserContactNotFound, UserRepoError],
    }),
    HttpApiEndpoint.get("listUserPreferences", "/:id/preferences", {
      params: { id: Uuid },
      query: PaginationQuery,
      success: ApiResponse(PaginatedData(UserPreferenceRecord)),
      error: UserRepoError,
    }),
    HttpApiEndpoint.put("setUserPreference", "/:id/preferences", {
      params: { id: Uuid },
      payload: Schema.Struct({
        channel: channelTypeSchema,
        enabled: Schema.Boolean,
      }),
      success: ApiResponse(UserPreferenceRecord),
      error: UserRepoError,
    }),
  )
  .prefix("/api/user")
{}
