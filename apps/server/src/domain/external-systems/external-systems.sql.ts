import {
  ExternalSystemConflict,
  ExternalSystemRecord,
  ExternalSystemRepoError,
  ExternalUserLinkConflict,
  ExternalUserLinkRecord,
  makeMapSqlError,
  normalizePagination,
  type ExternalSystemRepoOperation,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { ExternalSystemRepoService } from "./external-systems.types";

const { toRepoError: toExternalSystemRepoError, mapSqlError } =
  makeMapSqlError<ExternalSystemRepoOperation, ExternalSystemRepoError>(
    (fields) => new ExternalSystemRepoError(fields),
    "Failed to query external systems",
  );

export function makeSqlExternalSystemsRepo(
  sql: SqlClient,
): ExternalSystemRepoService {
  // ---------- external_systems ----------

  const addExternalSystem: ExternalSystemRepoService["addExternalSystem"] =
    Effect.fn("ExternalSystemsRepo.addExternalSystem")(function* (input) {
      const rows = yield* sql<ExternalSystemRecord>`
        INSERT INTO external_systems (name, api_key)
        VALUES (${input.name}, ${input.api_key})
        RETURNING id, name, api_key, created_at, updated_at, deleted_at
      `.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new ExternalSystemConflict({
              message: `A system with name "${input.name}" or that API key already exists`,
            }),
          (_reasons, error) =>
            Effect.fail(toExternalSystemRepoError("addExternalSystem", error)),
        ),
      );

      return rows[0]!;
    });

  const findExternalSystemById: ExternalSystemRepoService["findExternalSystemById"] =
    Effect.fn("ExternalSystemsRepo.findExternalSystemById")(function* (id) {
      const rows = yield* sql<ExternalSystemRecord>`
        SELECT id, name, api_key, created_at, updated_at, deleted_at
        FROM external_systems
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(mapSqlError("findExternalSystemById"));

      return rows[0] ?? null;
    });

  const listExternalSystems: ExternalSystemRepoService["listExternalSystems"] =
    Effect.fn("ExternalSystemsRepo.listExternalSystems")(function* (input) {
      const { skip, limit } = normalizePagination(input);
      const namePattern = input.name ? `%${input.name}%` : null;

      const rows = yield* sql<
        ExternalSystemRecord & { readonly total_count: number }
      >`
        SELECT id, name, api_key, created_at, updated_at, deleted_at,
               COUNT(*) OVER()::int AS total_count
        FROM external_systems
        WHERE deleted_at IS NULL
          AND (${namePattern}::text IS NULL OR name ILIKE ${namePattern})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listExternalSystems"));

      return {
        items: rows.map((row) => new ExternalSystemRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
    });

  const updateExternalSystem: ExternalSystemRepoService["updateExternalSystem"] =
    Effect.fn("ExternalSystemsRepo.updateExternalSystem")(function* (
      id,
      input,
    ) {
      const rows = yield* sql<ExternalSystemRecord>`
        UPDATE external_systems
        SET
          name = COALESCE(${input.name ?? null}, name),
          api_key = COALESCE(${input.api_key ?? null}, api_key),
          updated_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id, name, api_key, created_at, updated_at, deleted_at
      `.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new ExternalSystemConflict({
              message: `A system with name "${input.name}" or that API key already exists`,
            }),
          (_reasons, error) =>
            Effect.fail(
              toExternalSystemRepoError("updateExternalSystem", error),
            ),
        ),
      );

      return rows[0] ?? null;
    });

  const deleteExternalSystem: ExternalSystemRepoService["deleteExternalSystem"] =
    Effect.fn("ExternalSystemsRepo.deleteExternalSystem")(function* (id) {
      const rows = yield* sql<{ id: string }>`
        UPDATE external_systems
        SET deleted_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `.pipe(mapSqlError("deleteExternalSystem"));

      return rows.length > 0;
    });

  // ---------- external_user_links ----------

  const addExternalUserLink: ExternalSystemRepoService["addExternalUserLink"] =
    Effect.fn("ExternalSystemsRepo.addExternalUserLink")(function* (input) {
      const rows = yield* sql<ExternalUserLinkRecord>`
        INSERT INTO external_user_links (external_system_id, external_user_id, user_id)
        VALUES (${input.external_system_id}, ${input.external_user_id}, ${input.user_id})
        RETURNING id, external_system_id, external_user_id, user_id, created_at, updated_at, deleted_at
      `.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new ExternalUserLinkConflict({
              message: `External user "${input.external_user_id}" is already linked for this system`,
            }),
          (_reasons, error) =>
            Effect.fail(
              toExternalSystemRepoError("addExternalUserLink", error),
            ),
        ),
      );

      return rows[0]!;
    });

  const listExternalUserLinksByUser: ExternalSystemRepoService["listExternalUserLinksByUser"] =
    Effect.fn("ExternalSystemsRepo.listExternalUserLinksByUser")(function* (
      userId,
      input,
    ) {
      const { skip, limit } = normalizePagination(input);

      const rows = yield* sql<
        ExternalUserLinkRecord & { readonly total_count: number }
      >`
        SELECT id, external_system_id, external_user_id, user_id, created_at, updated_at, deleted_at,
               COUNT(*) OVER()::int AS total_count
        FROM external_user_links
        WHERE user_id = ${userId} AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listExternalUserLinksByUser"));

      return {
        items: rows.map((row) => new ExternalUserLinkRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
    });

  const deleteExternalUserLink: ExternalSystemRepoService["deleteExternalUserLink"] =
    Effect.fn("ExternalSystemsRepo.deleteExternalUserLink")(function* (id) {
      const rows = yield* sql<{ id: string }>`
        UPDATE external_user_links
        SET deleted_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `.pipe(mapSqlError("deleteExternalUserLink"));

      return rows.length > 0;
    });

  return {
    addExternalSystem,
    findExternalSystemById,
    listExternalSystems,
    updateExternalSystem,
    deleteExternalSystem,
    addExternalUserLink,
    listExternalUserLinksByUser,
    deleteExternalUserLink,
  };
}
