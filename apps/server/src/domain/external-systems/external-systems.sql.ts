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

  // with a few counts, so the systems list says something useful
  const SYSTEM_COLUMNS = sql.literal(`
    id, name, created_at, updated_at, deleted_at,
    (SELECT count(*)::int FROM api_keys k
      WHERE k.external_system_id = external_systems.id AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at > now()))                                   AS active_api_keys,
    (SELECT count(*)::int FROM notification_templates t
      WHERE t.external_system_id = external_systems.id AND t.deleted_at IS NULL)              AS template_count,
    (SELECT count(*)::int FROM external_user_links l
      WHERE l.external_system_id = external_systems.id AND l.deleted_at IS NULL)              AS user_count,
    (SELECT count(*)::int FROM notifications n
      WHERE n.external_system_id = external_systems.id AND n.deleted_at IS NULL
        AND n.created_at >= now() - interval '30 days')                                       AS notifications_30d,
    (SELECT max(n.created_at) FROM notifications n
      WHERE n.external_system_id = external_systems.id AND n.deleted_at IS NULL)              AS last_notification_at
  `);

  const addExternalSystem: ExternalSystemRepoService["addExternalSystem"] =
    Effect.fn("ExternalSystemsRepo.addExternalSystem")(function* (input) {
      const rows = yield* sql<ExternalSystemRecord>`
        INSERT INTO external_systems (name)
        VALUES (${input.name})
        RETURNING ${SYSTEM_COLUMNS}
      `.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new ExternalSystemConflict({
              message: `A system named "${input.name}" already exists`,
            }),
          (_reasons, error) =>
            Effect.fail(toExternalSystemRepoError("addExternalSystem", error)),
        ),
      );

      return new ExternalSystemRecord(rows[0]!);
    });

  const findExternalSystemById: ExternalSystemRepoService["findExternalSystemById"] =
    Effect.fn("ExternalSystemsRepo.findExternalSystemById")(function* (id) {
      const rows = yield* sql<ExternalSystemRecord>`
        SELECT ${SYSTEM_COLUMNS}
        FROM external_systems
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(mapSqlError("findExternalSystemById"));

      return rows[0] ? new ExternalSystemRecord(rows[0]) : null;
    });

  const listExternalSystems: ExternalSystemRepoService["listExternalSystems"] =
    Effect.fn("ExternalSystemsRepo.listExternalSystems")(function* (input) {
      const { skip, limit } = normalizePagination(input);
      const namePattern = input.name ? `%${input.name}%` : null;

      const rows = yield* sql<
        ExternalSystemRecord & { readonly total_count: number }
      >`
        SELECT ${SYSTEM_COLUMNS},
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
          updated_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING ${SYSTEM_COLUMNS}
      `.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new ExternalSystemConflict({
              message: `A system named "${input.name}" already exists`,
            }),
          (_reasons, error) =>
            Effect.fail(
              toExternalSystemRepoError("updateExternalSystem", error),
            ),
        ),
      );

      return rows[0] ? new ExternalSystemRecord(rows[0]) : null;
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
        WITH inserted AS (
          INSERT INTO external_user_links (external_system_id, external_user_id, user_id)
          VALUES (${input.external_system_id}, ${input.external_user_id}, ${input.user_id})
          RETURNING id, external_system_id, external_user_id, user_id, created_at, updated_at, deleted_at
        )
        SELECT i.*, s.name AS system_name,
               COALESCE(NULLIF(btrim(u.name), ''), i.external_user_id) AS user_display_name
        FROM inserted i
        JOIN external_systems s ON s.id = i.external_system_id
        JOIN users u            ON u.id = i.user_id
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

      return new ExternalUserLinkRecord(rows[0]!);
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
        SELECT l.id, l.external_system_id, l.external_user_id, l.user_id, l.created_at, l.updated_at, l.deleted_at,
               s.name AS system_name, ul.display_name AS user_display_name,
               COUNT(*) OVER()::int AS total_count
        FROM external_user_links l
        JOIN external_systems s ON s.id = l.external_system_id
        JOIN user_labels ul     ON ul.id = l.user_id
        WHERE l.user_id = ${userId} AND l.deleted_at IS NULL
        ORDER BY l.created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listExternalUserLinksByUser"));

      return {
        items: rows.map((row) => new ExternalUserLinkRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
    });

  const listExternalUserLinksBySystem: ExternalSystemRepoService["listExternalUserLinksBySystem"] =
    Effect.fn("ExternalSystemsRepo.listExternalUserLinksBySystem")(function* (
      externalSystemId,
      input,
    ) {
      const { skip, limit } = normalizePagination(input);

      const rows = yield* sql<
        ExternalUserLinkRecord & { readonly total_count: number }
      >`
        SELECT l.id, l.external_system_id, l.external_user_id, l.user_id, l.created_at, l.updated_at, l.deleted_at,
               s.name AS system_name, ul.display_name AS user_display_name,
               COUNT(*) OVER()::int AS total_count
        FROM external_user_links l
        JOIN external_systems s ON s.id = l.external_system_id
        JOIN user_labels ul     ON ul.id = l.user_id
        WHERE l.external_system_id = ${externalSystemId} AND l.deleted_at IS NULL
        ORDER BY l.created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listExternalUserLinksBySystem"));

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
    listExternalUserLinksBySystem,
    deleteExternalUserLink,
  };
}
