import {
  UserContactConflict,
  UserRepoError,
  type UserContactRecord,
  type UserPreferenceRecord,
  type UserRecord,
  type UserRepoOperation,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { UserRepoService } from "./users.types";

export function makeSqlUsersRepo(sql: SqlClient): UserRepoService {
  const addUser: UserRepoService["addUser"] = Effect.fn(
    "UsersRepo.addUser",
  )(function* (_input) {
    const rows = yield* sql<UserRecord>`
      INSERT INTO users DEFAULT VALUES
      RETURNING id, created_at, updated_at, deleted_at
    `.pipe(mapSqlError("addUser"));

    return rows[0]!;
  });

  const findUserById: UserRepoService["findUserById"] = Effect.fn(
    "UsersRepo.findUserById",
  )(function* (id) {
    const rows = yield* sql<UserRecord>`
      SELECT id, created_at, updated_at, deleted_at
      FROM users
      WHERE id = ${id} AND deleted_at IS NULL
    `.pipe(mapSqlError("getUserById"));

    return rows[0] ?? null;
  });

  const listUsers: UserRepoService["listUsers"] = Effect.fn(
    "UsersRepo.listUsers",
  )(function* () {
    return yield* sql<UserRecord>`
      SELECT id, created_at, updated_at, deleted_at
      FROM users
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `.pipe(mapSqlError("listUsers"));
  });

  const deleteUser: UserRepoService["deleteUser"] = Effect.fn(
    "UsersRepo.deleteUser",
  )(function* (id) {
    const rows = yield* sql<{ id: string }>`
      UPDATE users
      SET deleted_at = now()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id
    `.pipe(mapSqlError("deleteUser"));

    return rows.length > 0;
  });

  const listUserContacts: UserRepoService["listUserContacts"] = Effect.fn(
    "UsersRepo.listUserContacts",
  )(function* (userId) {
    return yield* sql<UserContactRecord>`
      SELECT id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
      FROM user_contacts
      WHERE user_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC
    `.pipe(mapSqlError("listUserContacts"));
  });

  const findUserContact: UserRepoService["findUserContact"] = Effect.fn(
    "UsersRepo.findUserContact",
  )(function* (userId, channel) {
    const rows = yield* sql<UserContactRecord>`
      SELECT id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
      FROM user_contacts
      WHERE user_id = ${userId} AND channel = ${channel} AND deleted_at IS NULL
    `.pipe(mapSqlError("getUserContact"));

    return rows[0] ?? null;
  });

  const addUserContact: UserRepoService["addUserContact"] = Effect.fn(
    "UsersRepo.addUserContact",
  )(function* (input) {
    const rows = yield* sql<UserContactRecord>`
      INSERT INTO user_contacts (user_id, channel, address, linked, verified)
      VALUES (${input.user_id}, ${input.channel}, ${input.address}, ${input.linked}, ${input.verified})
      RETURNING id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
    `.pipe(
      Effect.catchReason(
        "SqlError",
        "UniqueViolation",
        () =>
          new UserContactConflict({
            message: `Contact for channel "${input.channel}" already exists for this user`,
          }),
        (_reasons, error) =>
          Effect.fail(toUserRepoError("addUserContact", error)),
      ),
    );

    return rows[0]!;
  });

  const updateUserContact: UserRepoService["updateUserContact"] = Effect.fn(
    "UsersRepo.updateUserContact",
  )(function* (userId, channel, input) {
    const rows = yield* sql<UserContactRecord>`
      UPDATE user_contacts
      SET
        address = COALESCE(${input.address ?? null}, address),
        linked = COALESCE(${input.linked ?? null}, linked),
        verified = COALESCE(${input.verified ?? null}, verified),
        updated_at = now()
      WHERE user_id = ${userId} AND channel = ${channel} AND deleted_at IS NULL
      RETURNING id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
    `.pipe(mapSqlError("updateUserContact"));

    return rows[0] ?? null;
  });

  const listUserPreferences: UserRepoService["listUserPreferences"] =
    Effect.fn("UsersRepo.listUserPreferences")(function* (userId) {
      return yield* sql<UserPreferenceRecord>`
        SELECT user_id, channel, enabled
        FROM user_preferences
        WHERE user_id = ${userId}
      `.pipe(mapSqlError("listUserPreferences"));
    });

  const setUserPreference: UserRepoService["setUserPreference"] = Effect.fn(
    "UsersRepo.setUserPreference",
  )(function* (input) {
    const rows = yield* sql<UserPreferenceRecord>`
      INSERT INTO user_preferences (user_id, channel, enabled)
      VALUES (${input.user_id}, ${input.channel}, ${input.enabled})
      ON CONFLICT (user_id, channel) DO UPDATE SET enabled = EXCLUDED.enabled
      RETURNING user_id, channel, enabled
    `.pipe(mapSqlError("setUserPreference"));

    return rows[0]!;
  });

  return {
    addUser,
    findUserById,
    listUsers,
    deleteUser,
    listUserContacts,
    findUserContact,
    addUserContact,
    updateUserContact,
    listUserPreferences,
    setUserPreference,
  };
}

function toUserRepoError(
  operation: UserRepoOperation,
  error: SqlError,
): UserRepoError {
  const cause = error.reason.cause;
  const sqlState = stringProperty(cause, "code");
  const constraint = stringProperty(cause, "constraint");
  return new UserRepoError({
    message: "Failed to query users",
    operation,
    ...(sqlState === undefined ? {} : { sqlState }),
    ...(constraint === undefined ? {} : { constraint }),
    cause: error,
  });
}

function mapSqlError<A>(operation: UserRepoOperation) {
  return (
    effect: Effect.Effect<A, SqlError>,
  ): Effect.Effect<A, UserRepoError> =>
    effect.pipe(
      Effect.mapError((error) => toUserRepoError(operation, error)),
    );
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }
  const prop = (value as Record<string, unknown>)[key];
  return typeof prop === "string" ? prop : undefined;
}
