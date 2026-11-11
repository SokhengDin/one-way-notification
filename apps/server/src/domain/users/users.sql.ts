import {
  makeMapSqlError,
  normalizePagination,
  UserContactConflict,
  UserContactRecord,
  UserPreferenceRecord,
  UserRecord,
  UserRepoError,
  type UserRepoOperation,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import { parsePgArray } from "../notifications/notifications.sql";
import type { UserRepoService } from "./users.types";

const { toRepoError: toUserRepoError, mapSqlError } = makeMapSqlError<
  UserRepoOperation,
  UserRepoError
>((fields) => new UserRepoError(fields), "Failed to query users");

// text[] arrives as an array, or as "{a,b}" depending on the driver path
const toUser = (row: UserRecord) =>
  new UserRecord({ ...row, channels: parsePgArray(row.channels) as UserRecord["channels"] });

export function makeSqlUsersRepo(sql: SqlClient): UserRepoService {
  // Users always come back with their readable label, from the
  // `user_labels` view (name → email → external id → short id).
  const selectUser = (id: string) => sql<UserRecord>`
    SELECT u.id, l.name, l.email, l.display_name, l.channels, u.created_at, u.updated_at, u.deleted_at
    FROM users u
    JOIN user_labels l ON l.id = u.id
    WHERE u.id = ${id} AND u.deleted_at IS NULL
  `;

  const cleanName = (name: string | null | undefined) =>
    name === undefined ? undefined : name === null || name.trim() === "" ? null : name.trim();

  const addUser: UserRepoService["addUser"] = Effect.fn(
    "UsersRepo.addUser",
  )(function* (input) {
    const inserted = yield* sql<{ id: string }>`
      INSERT INTO users (name) VALUES (${cleanName(input.name) ?? null})
      RETURNING id
    `.pipe(mapSqlError("addUser"));

    const rows = yield* selectUser(inserted[0]!.id).pipe(mapSqlError("addUser"));
    return toUser(rows[0]!);
  });

  const findUserById: UserRepoService["findUserById"] = Effect.fn(
    "UsersRepo.findUserById",
  )(function* (id) {
    const rows = yield* selectUser(id).pipe(mapSqlError("getUserById"));

    const row = rows[0];
    return row ? toUser(row) : null;
  });

  const listUsers: UserRepoService["listUsers"] = Effect.fn(
    "UsersRepo.listUsers",
  )(function* (input) {
    const { skip, limit } = normalizePagination(input);
    const q       = input.q?.trim() ?? "";
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const system  = input.external_system_id ?? null;

    const rows = yield* sql<UserRecord & { readonly total_count: number }>`
      SELECT u.id, l.name, l.email, l.display_name, l.channels, u.created_at, u.updated_at, u.deleted_at,
             COUNT(*) OVER()::int AS total_count
      FROM users u
      JOIN user_labels l ON l.id = u.id
      WHERE u.deleted_at IS NULL
        AND (${q} = '' OR l.display_name ILIKE ${pattern} OR l.email ILIKE ${pattern}
             OR l.external_user_id ILIKE ${pattern} OR u.id::text = ${q})
        AND (${system}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM external_user_links el
          WHERE el.user_id = u.id AND el.external_system_id = ${system}::uuid AND el.deleted_at IS NULL
        ))
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `.pipe(mapSqlError("listUsers"));

    return {
      items: rows.map((row) => toUser(row)),
      total: rows[0]?.total_count ?? 0,
      skip,
      limit,
    };
  });

  const updateUser: UserRepoService["updateUser"] = Effect.fn(
    "UsersRepo.updateUser",
  )(function* (id, input) {
    const name = cleanName(input.name);
    const updated = yield* sql<{ id: string }>`
      UPDATE users
      SET name       = CASE WHEN ${name !== undefined} THEN ${name ?? null} ELSE name END,
          updated_at = now()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id
    `.pipe(mapSqlError("updateUser"));
    if (updated.length === 0) return null;

    const rows = yield* selectUser(id).pipe(mapSqlError("updateUser"));
    return rows[0] ? toUser(rows[0]) : null;
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
  )(function* (userId, input) {
    const { skip, limit } = normalizePagination(input);

    const rows = yield* sql<
      UserContactRecord & { readonly total_count: number }
    >`
      SELECT id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at,
             COUNT(*) OVER()::int AS total_count
      FROM user_contacts
      WHERE user_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `.pipe(mapSqlError("listUserContacts"));

    return {
      items: rows.map((row) => new UserContactRecord(row)),
      total: rows[0]?.total_count ?? 0,
      skip,
      limit,
    };
  });

  const findUserContact: UserRepoService["findUserContact"] = Effect.fn(
    "UsersRepo.findUserContact",
  )(function* (userId, channel) {
    const rows = yield* sql<UserContactRecord>`
      SELECT id, user_id, channel, address, linked, verified, created_at, updated_at, deleted_at
      FROM user_contacts
      WHERE user_id = ${userId} AND channel = ${channel} AND deleted_at IS NULL
    `.pipe(mapSqlError("getUserContact"));

    const row = rows[0];
    return row ? new UserContactRecord(row) : null;
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

    return new UserContactRecord(rows[0]!);
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

    const row = rows[0];
    return row ? new UserContactRecord(row) : null;
  });

  const listUserPreferences: UserRepoService["listUserPreferences"] =
    Effect.fn("UsersRepo.listUserPreferences")(function* (userId, input) {
      const { skip, limit } = normalizePagination(input);

      const rows = yield* sql<
        UserPreferenceRecord & { readonly total_count: number }
      >`
        SELECT user_id, channel, enabled,
               COUNT(*) OVER()::int AS total_count
        FROM user_preferences
        WHERE user_id = ${userId}
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listUserPreferences"));

      return {
        items: rows.map((row) => new UserPreferenceRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
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

    return new UserPreferenceRecord(rows[0]!);
  });

  return {
    addUser,
    findUserById,
    listUsers,
    updateUser,
    deleteUser,
    listUserContacts,
    findUserContact,
    addUserContact,
    updateUserContact,
    listUserPreferences,
    setUserPreference,
  };
}
