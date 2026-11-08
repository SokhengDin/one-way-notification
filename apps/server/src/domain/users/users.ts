import { UserContactNotFound, UserNotFound } from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { makeSqlUsersRepo } from "./users.sql";
import type {
  UserRepoService as UserRepoServiceShape,
  UsersService,
} from "./users.types";

export class UsersRepo extends Context.Service<
  UsersRepo,
  UserRepoServiceShape
>()("app/domain/users/UsersRepo") {
  static readonly layer = Layer.effect(
    UsersRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlUsersRepo(sql);
    }),
  );
}

export class Users extends Context.Service<Users, UsersService>()(
  "app/domain/users/Users",
) {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      const repo = yield* UsersRepo;

      const addUser: UsersService["addUser"] = Effect.fn("Users.addUser")(
        function* (input) {
          return yield* repo.addUser(input);
        },
      );

      const getUserById: UsersService["getUserById"] = Effect.fn(
        "Users.getUserById",
      )(function* (id) {
        const user = yield* repo.findUserById(id);
        if (user === null) {
          return yield* new UserNotFound({ id });
        }
        return user;
      });

      const listUsers: UsersService["listUsers"] = Effect.fn(
        "Users.listUsers",
      )(function* (input) {
        return yield* repo.listUsers(input);
      });

      const updateUser: UsersService["updateUser"] = Effect.fn(
        "Users.updateUser",
      )(function* (id, input) {
        const user = yield* repo.updateUser(id, input);
        if (user === null) {
          return yield* new UserNotFound({ id });
        }
        return user;
      });

      const deleteUser: UsersService["deleteUser"] = Effect.fn(
        "Users.deleteUser",
      )(function* (id) {
        const deleted = yield* repo.deleteUser(id);
        if (!deleted) {
          return yield* new UserNotFound({ id });
        }
      });

      const listUserContacts: UsersService["listUserContacts"] = Effect.fn(
        "Users.listUserContacts",
      )(function* (userId, input) {
        return yield* repo.listUserContacts(userId, input);
      });

      const getUserContact: UsersService["getUserContact"] = Effect.fn(
        "Users.getUserContact",
      )(function* (userId, channel) {
        const contact = yield* repo.findUserContact(userId, channel);
        if (contact === null) {
          return yield* new UserContactNotFound({ userId, channel });
        }
        return contact;
      });

      const addUserContact: UsersService["addUserContact"] = Effect.fn(
        "Users.addUserContact",
      )(function* (input) {
        return yield* repo.addUserContact(input);
      });

      const updateUserContact: UsersService["updateUserContact"] = Effect.fn(
        "Users.updateUserContact",
      )(function* (userId, channel, input) {
        const contact = yield* repo.updateUserContact(
          userId,
          channel,
          input,
        );
        if (contact === null) {
          return yield* new UserContactNotFound({ userId, channel });
        }
        return contact;
      });

      const listUserPreferences: UsersService["listUserPreferences"] =
        Effect.fn("Users.listUserPreferences")(function* (userId, input) {
          return yield* repo.listUserPreferences(userId, input);
        });

      const setUserPreference: UsersService["setUserPreference"] = Effect.fn(
        "Users.setUserPreference",
      )(function* (input) {
        return yield* repo.setUserPreference(input);
      });

      return {
        addUser,
        getUserById,
        listUsers,
        updateUser,
        deleteUser,
        listUserContacts,
        getUserContact,
        addUserContact,
        updateUserContact,
        listUserPreferences,
        setUserPreference,
      };
    }),
  ).pipe(Layer.provide(UsersRepo.layer));
}
