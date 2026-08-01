import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { channelTypeSchema } from "../enums";
import {
  UserContactRecord,
  UserPreferenceRecord,
  UserRecord,
} from "../domain/users";
import {
  UserContactConflict,
  UserContactNotFound,
  UserNotFound,
} from "../domain/users.errors";

export class UsersApiGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("listUsers", "/", {
      success: Schema.Array(UserRecord),
    }),
    HttpApiEndpoint.post("addUser", "/", {
      success: UserRecord,
    }),
    HttpApiEndpoint.get("getUserById", "/:id", {
      params: { id: Schema.String },
      success: UserRecord,
      error: UserNotFound,
    }),
    HttpApiEndpoint.make("DELETE")("deleteUser", "/:id", {
      params: { id: Schema.String },
      success: HttpApiSchema.NoContent,
      error: UserNotFound,
    }),
    HttpApiEndpoint.get("listUserContacts", "/:id/contacts", {
      params: { id: Schema.String },
      success: Schema.Array(UserContactRecord),
    }),
    HttpApiEndpoint.post("addUserContact", "/:id/contacts", {
      params: { id: Schema.String },
      payload: Schema.Struct({
        channel: channelTypeSchema,
        address: Schema.NullOr(Schema.String),
        linked: Schema.Boolean,
        verified: Schema.Boolean,
      }),
      success: UserContactRecord,
      error: UserContactConflict,
    }),
    HttpApiEndpoint.get("getUserContact", "/:id/contacts/:channel", {
      params: { id: Schema.String, channel: channelTypeSchema },
      success: UserContactRecord,
      error: UserContactNotFound,
    }),
    HttpApiEndpoint.patch("updateUserContact", "/:id/contacts/:channel", {
      params: { id: Schema.String, channel: channelTypeSchema },
      payload: Schema.Struct({
        address: Schema.optional(Schema.NullOr(Schema.String)),
        linked: Schema.optional(Schema.Boolean),
        verified: Schema.optional(Schema.Boolean),
      }),
      success: UserContactRecord,
      error: UserContactNotFound,
    }),
    HttpApiEndpoint.get("listUserPreferences", "/:id/preferences", {
      params: { id: Schema.String },
      success: Schema.Array(UserPreferenceRecord),
    }),
    HttpApiEndpoint.put("setUserPreference", "/:id/preferences", {
      params: { id: Schema.String },
      payload: Schema.Struct({
        channel: channelTypeSchema,
        enabled: Schema.Boolean,
      }),
      success: UserPreferenceRecord,
    }),
  )
  .prefix("/user")
{}
