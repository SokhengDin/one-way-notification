import { PgClient } from "@effect/sql-pg";
import {
  UserContactConflict,
  UserContactNotFound,
  UserNotFound,
  UsersError,
  type ChannelType,
  type UserContactRecord,
  type UserPreferenceRecord,
  type UserRecord,
} from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import type {
  AddUser,
  AddUserContacts,
  AddUserPreference,
  UpdateUserContact,
  UserRepoService as UserRepoServiceShape,
} from "./users.types";

export class UserRepoService extends Context.Service<
  UserRepoService,
  UserRepoServiceShape
>()("app/domain/users/UserRepoService") {
  static readonly layer = Layer.effect(
    UserRepoService,
    Effect.gen(function* () {
      const sql = yield* PgClient.PgClient;

      const addUser = Effect.fn("UserRepoService.addUser")(
        function* (_input: AddUser) {
          const rows = yield* sql<UserRecord>`
            INSERT INTO users DEFAULT VALUES
            RETURNING id, created_at, updated_at, deleted_at
          `.pipe(Effect.orDie);

          return rows[0]!;
        },
      );

      const getUserById = Effect.fn("UserRepoService.getUserById")(
        function* (id: string) {
          const rows = yield* sql<UserRecord>`
            SELECT id, created_at, updated_at, deleted_at
            FROM users
            WHERE id = ${id} AND deleted_at IS NULL
          `.pipe(Effect.orDie);

          const row = rows[0];
          if (!row) {
            return yield* new UsersError({ reason: new UserNotFound({ id }) });
          }

          return row;
        },
      );

      const listUsers = Effect.fn("UserRepoService.listUsers")(function* () {
        return yield* sql<UserRecord>`
          SELECT id, created_at, updated_at, deleted_at
          FROM users
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC
        `.pipe(Effect.orDie);
      });

      const deleteUser = Effect.fn("UserRepoService.deleteUser")(
        function* (id: string) {
          const rows = yield* sql<{ id: string }>`
            UPDATE users
            SET deleted_at = now()
            WHERE id = ${id} AND deleted_at IS NULL
            RETURNING id
          `.pipe(Effect.orDie);

          if (!rows[0]) {
            return yield* new UsersError({ reason: new UserNotFound({ id }) });
          }
        },
      );

      const listUserContacts = Effect.fn("UserRepoService.listUserContacts")(
        function* (userId: string) {
          return yield* sql<UserContactRecord>`
            SELECT id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
            FROM user_contacts
            WHERE user_id = ${userId} AND deleted_at IS NULL
            ORDER BY created_at DESC
          `.pipe(Effect.orDie);
        },
      );

      const getUserContact = Effect.fn("UserRepoService.getUserContact")(
        function* (userId: string, channel: ChannelType) {
          const rows = yield* sql<UserContactRecord>`
            SELECT id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
            FROM user_contacts
            WHERE user_id = ${userId} AND channel = ${channel} AND deleted_at IS NULL
          `.pipe(Effect.orDie);

          const row = rows[0];
          if (!row) {
            return yield* new UsersError({
              reason: new UserContactNotFound({ userId, channel }),
            });
          }

          return row;
        },
      );

      const addUserContact = Effect.fn("UserRepoService.addUserContact")(
        function* (input: AddUserContacts) {
          const rows = yield* sql<UserContactRecord>`
            INSERT INTO user_contacts (user_id, channel, address, linked, verified)
            VALUES (${input.user_id}, ${input.channel}, ${input.address}, ${input.linked}, ${input.verified})
            RETURNING id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
          `.pipe(
            Effect.catchReason(
              "SqlError",
              "UniqueViolation",
              () =>
                new UsersError({
                  reason: new UserContactConflict({
                    message: `Contact for channel "${input.channel}" already exists for this user`,
                  }),
                }),
              Effect.die,
            ),
          );

          return rows[0]!;
        },
      );

      const updateUserContact = Effect.fn(
        "UserRepoService.updateUserContact",
      )(function* (
        userId: string,
        channel: ChannelType,
        input: UpdateUserContact,
      ) {
        const rows = yield* sql<UserContactRecord>`
          UPDATE user_contacts
          SET
            address = COALESCE(${input.address ?? null}, address),
            linked = COALESCE(${input.linked ?? null}, linked),
            verified = COALESCE(${input.verified ?? null}, verified),
            updated_at = now()
          WHERE user_id = ${userId} AND channel = ${channel} AND deleted_at IS NULL
          RETURNING id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
        `.pipe(Effect.orDie);

        const row = rows[0];
        if (!row) {
          return yield* new UsersError({
            reason: new UserContactNotFound({ userId, channel }),
          });
        }

        return row;
      });

      const listUserPreferences = Effect.fn(
        "UserRepoService.listUserPreferences",
      )(function* (userId: string) {
        return yield* sql<UserPreferenceRecord>`
          SELECT user_id, channel, enabled
          FROM user_preferences
          WHERE user_id = ${userId}
        `.pipe(Effect.orDie);
      });

      const setUserPreference = Effect.fn(
        "UserRepoService.setUserPreference",
      )(function* (input: AddUserPreference) {
        const rows = yield* sql<UserPreferenceRecord>`
          INSERT INTO user_preferences (user_id, channel, enabled)
          VALUES (${input.user_id}, ${input.channel}, ${input.enabled})
          ON CONFLICT (user_id, channel) DO UPDATE SET enabled = EXCLUDED.enabled
          RETURNING user_id, channel, enabled
        `.pipe(Effect.orDie);

        return rows[0]!;
      });

      return UserRepoService.of({
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
      });
    }),
  );
}
