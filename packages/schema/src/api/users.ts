import { Schema } from "effect";
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
import { ApiResponse } from "./response";

export class UsersApiGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("listUsers", "/", {
      success: ApiResponse(Schema.Array(UserRecord)),
      error: UserRepoError,
    }),
    HttpApiEndpoint.post("addUser", "/", {
      success: ApiResponse(UserRecord),
      error: UserRepoError,
    }),
    HttpApiEndpoint.get("getUserById", "/:id", {
      params: { id: Schema.String },
      success: ApiResponse(UserRecord),
      error: [UserNotFound, UserRepoError],
    }),
    HttpApiEndpoint.make("DELETE")("deleteUser", "/:id", {
      params: { id: Schema.String },
      success: HttpApiSchema.NoContent,
      error: [UserNotFound, UserRepoError],
    }),
    HttpApiEndpoint.get("listUserContacts", "/:id/contacts", {
      params: { id: Schema.String },
      success: ApiResponse(Schema.Array(UserContactRecord)),
      error: UserRepoError,
    }),
    HttpApiEndpoint.post("addUserContact", "/:id/contacts", {
      params: { id: Schema.String },
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
      params: { id: Schema.String, channel: channelTypeSchema },
      success: ApiResponse(UserContactRecord),
      error: [UserContactNotFound, UserRepoError],
    }),
    HttpApiEndpoint.patch("updateUserContact", "/:id/contacts/:channel", {
      params: { id: Schema.String, channel: channelTypeSchema },
      payload: Schema.Struct({
        address: Schema.optional(Schema.NullOr(Schema.String)),
        linked: Schema.optional(Schema.Boolean),
        verified: Schema.optional(Schema.Boolean),
      }),
      success: ApiResponse(UserContactRecord),
      error: [UserContactNotFound, UserRepoError],
    }),
    HttpApiEndpoint.get("listUserPreferences", "/:id/preferences", {
      params: { id: Schema.String },
      success: ApiResponse(Schema.Array(UserPreferenceRecord)),
      error: UserRepoError,
    }),
    HttpApiEndpoint.put("setUserPreference", "/:id/preferences", {
      params: { id: Schema.String },
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
