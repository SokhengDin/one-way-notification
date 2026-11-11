import { ApiKeyRecord, ApiKeyRepoError, makeMapSqlError, type ApiKeyRepoOperation } from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { ApiKeysRepoService } from "./api-keys.types";

const { mapSqlError } = makeMapSqlError<ApiKeyRepoOperation, ApiKeyRepoError>(
  (fields) => new ApiKeyRepoError(fields),
  "Failed to query API keys",
);

export function makeSqlApiKeysRepo(sql: SqlClient): ApiKeysRepoService {
  // status is worked out here so every reader agrees on it
  const COLUMNS = sql.literal(`
    k.id, k.external_system_id, k.name, k.prefix, k.last_four, k.legacy,
    k.expires_at, k.created_at, k.revoked_at, k.last_used_at, k.last_used_ip,
    CASE
      WHEN k.revoked_at IS NOT NULL                          THEN 'revoked'
      WHEN k.expires_at IS NOT NULL AND k.expires_at <= now() THEN 'expired'
      ELSE 'active'
    END                                    AS status,
    creator.name                           AS created_by_name,
    revoker.name                           AS revoked_by_name
  `);
  const JOINS = sql.literal(`
    LEFT JOIN admins creator ON creator.id = k.created_by
    LEFT JOIN admins revoker ON revoker.id = k.revoked_by
  `);
  const ACTIVE = sql.literal(`k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > now())`);

  const byId = (id: string) =>
    sql<ApiKeyRecord>`SELECT ${COLUMNS} FROM api_keys k ${JOINS} WHERE k.id = ${id}`;

  return {
    insertApiKey: (input) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ id: string }>`
          INSERT INTO api_keys (external_system_id, name, prefix, last_four, key_hash, created_by, expires_at)
          VALUES (${input.external_system_id}, ${input.name}, ${input.prefix}, ${input.last_four},
                  ${input.key_hash}, ${input.created_by}, now() + make_interval(days => ${input.expires_in_days}))
          RETURNING id
        `;
        const [row] = yield* byId(rows[0]!.id);
        return new ApiKeyRecord(row!);
      }).pipe(mapSqlError("insertApiKey")),

    listApiKeys: (externalSystemId, includeInactive) =>
      sql<ApiKeyRecord>`
        SELECT ${COLUMNS}
        FROM api_keys k ${JOINS}
        WHERE k.external_system_id = ${externalSystemId}
          AND (${includeInactive} OR (${ACTIVE}))
        ORDER BY (${ACTIVE}) DESC, k.created_at DESC
      `.pipe(
        Effect.map((rows) => rows.map((row) => new ApiKeyRecord(row))),
        mapSqlError("listApiKeys"),
      ),

    findApiKeyById: (id) =>
      byId(id).pipe(
        Effect.map((rows) => (rows[0] ? new ApiKeyRecord(rows[0]) : null)),
        mapSqlError("findApiKeyById"),
      ),

    revokeApiKey: (id, adminId) =>
      Effect.gen(function* () {
        // already revoked keeps its original revocation
        yield* sql`
          UPDATE api_keys SET revoked_at = now(), revoked_by = ${adminId}
          WHERE id = ${id} AND revoked_at IS NULL
        `;
        const [row] = yield* byId(id);
        return row ? new ApiKeyRecord(row) : null;
      }).pipe(mapSqlError("revokeApiKey")),

    shortenApiKey: (id, hours) =>
      // never extends: a key that expires sooner keeps its expiry
      sql`
        UPDATE api_keys
        SET expires_at = LEAST(COALESCE(expires_at, 'infinity'), now() + make_interval(hours => ${hours}))
        WHERE id = ${id} AND revoked_at IS NULL
      `.pipe(Effect.asVoid, mapSqlError("shortenApiKey")),

    countActiveApiKeys: (externalSystemId) =>
      sql<{ count: number }>`
        SELECT count(*)::int AS count FROM api_keys k
        WHERE k.external_system_id = ${externalSystemId} AND ${ACTIVE}
      `.pipe(Effect.map((rows) => rows[0]?.count ?? 0), mapSqlError("countActiveApiKeys")),

    findActiveKeyByHash: (keyHash) =>
      sql<{ id: string; external_system_id: string }>`
        SELECT k.id, k.external_system_id
        FROM api_keys k
        JOIN external_systems s ON s.id = k.external_system_id AND s.deleted_at IS NULL
        WHERE k.key_hash = ${keyHash} AND ${ACTIVE}
      `.pipe(Effect.map((rows) => rows[0] ?? null), mapSqlError("findActiveKeyByHash")),

    touchApiKey: (id, ip) =>
      // at most one write a minute per key, however busy it is
      sql`
        UPDATE api_keys SET last_used_at = now(), last_used_ip = ${ip}
        WHERE id = ${id} AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
      `.pipe(Effect.asVoid, mapSqlError("touchApiKey")),
  };
}
