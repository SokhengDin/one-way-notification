import { Api, ok, type ChannelType } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Users } from "./users";

export const UsersApiHandlers = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fn(function* (handlers) {
    const users = yield* Users;

    return handlers
      .handle("listUsers", ({ query }) => users.listUsers(query).pipe(Effect.map((data) => ok(data))))
      .handle("addUser", ({ payload }) =>
        users.addUser(payload).pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("updateUser", ({ params, payload }) =>
        users.updateUser(params.id, payload).pipe(Effect.map((data) => ok(data))),
      )
      .handle("getUserById", ({ params }) =>
        users.getUserById(params.id).pipe(Effect.map((data) => ok(data))),
      )
      .handle("deleteUser", ({ params }) => users.deleteUser(params.id))
      .handle("listUserContacts", ({ params, query }) =>
        users
          .listUserContacts(params.id, query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("addUserContact", ({ params, payload }) =>
        users
          .addUserContact({ ...payload, user_id: params.id })
          .pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("getUserContact", ({ params }) =>
        users
          .getUserContact(params.id, params.channel as ChannelType)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("updateUserContact", ({ params, payload }) =>
        users
          .updateUserContact(
            params.id,
            params.channel as ChannelType,
            payload,
          )
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("listUserPreferences", ({ params, query }) =>
        users
          .listUserPreferences(params.id, query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("setUserPreference", ({ params, payload }) =>
        users
          .setUserPreference({ ...payload, user_id: params.id })
          .pipe(Effect.map((data) => ok(data))),
      );
  }),
).pipe(Layer.provide(Users.layer));
