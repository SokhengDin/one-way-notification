import { Api, type ChannelType } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { UserRepoService } from "./users";

export const UsersApiHandlers = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fn(function* (handlers) {
    const users = yield* UserRepoService;

    return handlers
      .handle("listUsers", () => users.listUsers())
      .handle("addUser", () => users.addUser({}))
      .handle("getUserById", ({ params }) =>
        users.getUserById(params.id).pipe(
          Effect.catchReasons("UsersError", {
            UserNotFound: (e) => Effect.fail(e),
          }, Effect.die),
        ),
      )
      .handle("deleteUser", ({ params }) =>
        users.deleteUser(params.id).pipe(
          Effect.catchReasons("UsersError", {
            UserNotFound: (e) => Effect.fail(e),
          }, Effect.die),
        ),
      )
      .handle("listUserContacts", ({ params }) =>
        users.listUserContacts(params.id),
      )
      .handle("addUserContact", ({ params, payload }) =>
        users.addUserContact({ ...payload, user_id: params.id }).pipe(
          Effect.catchReasons("UsersError", {
            UserContactConflict: (e) => Effect.fail(e),
          }, Effect.die),
        ),
      )
      .handle("getUserContact", ({ params }) =>
        users.getUserContact(params.id, params.channel as ChannelType).pipe(
          Effect.catchReasons("UsersError", {
            UserContactNotFound: (e) => Effect.fail(e),
          }, Effect.die),
        ),
      )
      .handle("updateUserContact", ({ params, payload }) =>
        users
          .updateUserContact(params.id, params.channel as ChannelType, payload)
          .pipe(
            Effect.catchReasons("UsersError", {
              UserContactNotFound: (e) => Effect.fail(e),
            }, Effect.die),
          ),
      )
      .handle("listUserPreferences", ({ params }) =>
        users.listUserPreferences(params.id),
      )
      .handle("setUserPreference", ({ params, payload }) =>
        users.setUserPreference({ ...payload, user_id: params.id }),
      );
  }),
).pipe(Layer.provide(UserRepoService.layer));
