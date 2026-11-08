import { AdminRecord, AuthRepoError, makeMapSqlError, type AuthRepoOperation } from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { AdminWithSecret, AuthRepoService, SessionAdmin } from "./auth.types";

const { mapSqlError } = makeMapSqlError<AuthRepoOperation, AuthRepoError>(
  (fields) => new AuthRepoError(fields),
  "Failed to query administrators",
);

const ADMIN_COLUMNS = "id, email, name, last_login_at, created_at";

export function makeSqlAuthRepo(sql: SqlClient): AuthRepoService {
  const toAdmin = (row: Record<string, unknown>) => new AdminRecord(row as unknown as AdminRecord);

  const findAdminByEmail: AuthRepoService["findAdminByEmail"] = Effect.fn("AuthRepo.findAdminByEmail")(
    function* (email) {
      const rows = yield* sql<Record<string, unknown>>`
        SELECT ${sql.literal(ADMIN_COLUMNS)}, password_hash, failed_attempts, locked_until
        FROM admins
        WHERE lower(email) = lower(${email}) AND deleted_at IS NULL
      `.pipe(mapSqlError("login"));
      const row = rows[0];
      if (!row) return null;
      return {
        admin:           toAdmin(row),
        password_hash:   String(row.password_hash),
        failed_attempts: Number(row.failed_attempts),
        locked_until:    (row.locked_until as Date | null) ?? null,
      } satisfies AdminWithSecret;
    },
  );

  const recordFailure: AuthRepoService["recordFailure"] = Effect.fn("AuthRepo.recordFailure")(
    function* (adminId, threshold, lockMinutes) {
      const rows = yield* sql<{ locked_until: Date | null }>`
        UPDATE admins
        SET failed_attempts = failed_attempts + 1,
            locked_until    = CASE
              WHEN failed_attempts + 1 >= ${threshold}::int
                THEN now() + make_interval(mins => ${lockMinutes}::int)
              ELSE locked_until
            END
        WHERE id = ${adminId}
        RETURNING locked_until
      `.pipe(mapSqlError("login"));
      return rows[0]?.locked_until ?? null;
    },
  );

  const createSession: AuthRepoService["createSession"] = Effect.fn("AuthRepo.createSession")(
    function* (input) {
      const rows = yield* sql<{ expires_at: Date }>`
        WITH ok AS (
          UPDATE admins
          SET failed_attempts = 0, locked_until = NULL, last_login_at = now()
          WHERE id = ${input.admin_id}
        )
        INSERT INTO admin_sessions (admin_id, token_hash, user_agent, ip, expires_at)
        VALUES (${input.admin_id}, ${input.token_hash}, ${input.user_agent}, ${input.ip},
                now() + make_interval(secs => ${input.ttl_seconds}::int))
        RETURNING expires_at
      `.pipe(mapSqlError("login"));
      return rows[0]!.expires_at;
    },
  );

  const findSession: AuthRepoService["findSession"] = Effect.fn("AuthRepo.findSession")(
    function* (tokenHash) {
      // touch last_seen_at at most once a minute, not on every request
      const rows = yield* sql<Record<string, unknown>>`
        WITH s AS (
          UPDATE admin_sessions
          SET last_seen_at = CASE WHEN last_seen_at < now() - interval '1 minute' THEN now() ELSE last_seen_at END
          WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > now()
          RETURNING id, admin_id
        )
        SELECT s.id AS session_id, a.id, a.email, a.name, a.last_login_at, a.created_at
        FROM s
        JOIN admins a ON a.id = s.admin_id AND a.deleted_at IS NULL
      `.pipe(mapSqlError("authenticate"));
      const row = rows[0];
      return row ? ({ session_id: String(row.session_id), admin: toAdmin(row) } satisfies SessionAdmin) : null;
    },
  );

  const revokeSession: AuthRepoService["revokeSession"] = Effect.fn("AuthRepo.revokeSession")(
    function* (tokenHash) {
      yield* sql`
        UPDATE admin_sessions SET revoked_at = now()
        WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
      `.pipe(mapSqlError("logout"));
    },
  );

  const countAdmins: AuthRepoService["countAdmins"] = sql<{ count: number }>`
    SELECT count(*)::int AS count FROM admins WHERE deleted_at IS NULL
  `.pipe(mapSqlError("bootstrapAdmin"), Effect.map((rows) => Number(rows[0]?.count ?? 0)));

  const insertAdmin: AuthRepoService["insertAdmin"] = Effect.fn("AuthRepo.insertAdmin")(
    function* (input) {
      const rows = yield* sql<Record<string, unknown>>`
        INSERT INTO admins (email, name, password_hash)
        VALUES (${input.email}, ${input.name}, ${input.password_hash})
        RETURNING ${sql.literal(ADMIN_COLUMNS)}
      `.pipe(mapSqlError("bootstrapAdmin"));
      return toAdmin(rows[0]!);
    },
  );

  return { findAdminByEmail, recordFailure, createSession, findSession, revokeSession, countAdmins, insertAdmin };
}
