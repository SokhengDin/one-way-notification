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

      const addUser: UsersService["addUser"] = (input) =>
        repo.addUser(input);

      const getUserById: UsersService["getUserById"] = Effect.fn(
        "Users.getUserById",
      )(function* (id) {
        const user = yield* repo.findUserById(id);
        if (user === null) {
          return yield* new UserNotFound({ id });
        }
        return user;
      });

      const listUsers: UsersService["listUsers"] = () => repo.listUsers();

      const deleteUser: UsersService["deleteUser"] = Effect.fn(
        "Users.deleteUser",
      )(function* (id) {
        const deleted = yield* repo.deleteUser(id);
        if (!deleted) {
          return yield* new UserNotFound({ id });
        }
      });

      const listUserContacts: UsersService["listUserContacts"] = (userId) =>
        repo.listUserContacts(userId);

      const getUserContact: UsersService["getUserContact"] = Effect.fn(
        "Users.getUserContact",
      )(function* (userId, channel) {
        const contact = yield* repo.findUserContact(userId, channel);
        if (contact === null) {
          return yield* new UserContactNotFound({ userId, channel });
        }
        return contact;
      });

      const addUserContact: UsersService["addUserContact"] = (input) =>
        repo.addUserContact(input);

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

      const listUserPreferences: UsersService["listUserPreferences"] = (
        userId,
      ) => repo.listUserPreferences(userId);

      const setUserPreference: UsersService["setUserPreference"] = (input) =>
        repo.setUserPreference(input);

      return {
        addUser,
        getUserById,
        listUsers,
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
