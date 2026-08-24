import { Api, type ChannelType } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Users } from "./users";

export const UsersApiHandlers = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fn(function* (handlers) {
    const users = yield* Users;

    return handlers
      .handle("listUsers", () => users.listUsers())
      .handle("addUser", () => users.addUser({}))
      .handle("getUserById", ({ params }) => users.getUserById(params.id))
      .handle("deleteUser", ({ params }) => users.deleteUser(params.id))
      .handle("listUserContacts", ({ params }) =>
        users.listUserContacts(params.id),
      )
      .handle("addUserContact", ({ params, payload }) =>
        users.addUserContact({ ...payload, user_id: params.id }),
      )
      .handle("getUserContact", ({ params }) =>
        users.getUserContact(params.id, params.channel as ChannelType),
      )
      .handle("updateUserContact", ({ params, payload }) =>
        users.updateUserContact(
          params.id,
          params.channel as ChannelType,
          payload,
        ),
      )
      .handle("listUserPreferences", ({ params }) =>
        users.listUserPreferences(params.id),
      )
      .handle("setUserPreference", ({ params, payload }) =>
        users.setUserPreference({ ...payload, user_id: params.id }),
      );
  }),
).pipe(Layer.provide(Users.layer));
