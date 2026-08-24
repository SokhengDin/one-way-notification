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
      .handle("listUsers", () => users.listUsers().pipe(Effect.map((data) => ok(data))))
      .handle("addUser", () =>
        users.addUser({}).pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("getUserById", ({ params }) =>
        users.getUserById(params.id).pipe(Effect.map((data) => ok(data))),
      )
      .handle("deleteUser", ({ params }) => users.deleteUser(params.id))
      .handle("listUserContacts", ({ params }) =>
        users.listUserContacts(params.id).pipe(Effect.map((data) => ok(data))),
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
      .handle("listUserPreferences", ({ params }) =>
        users
          .listUserPreferences(params.id)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("setUserPreference", ({ params, payload }) =>
        users
          .setUserPreference({ ...payload, user_id: params.id })
          .pipe(Effect.map((data) => ok(data))),
      );
  }),
).pipe(Layer.provide(Users.layer));
