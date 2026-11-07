import {
  ChannelProviderConflict,
  ChannelProviderRecord,
  makeMapSqlError,
  normalizePagination,
  ProviderRepoError,
  ProviderUsageLogRecord,
  type ProviderRepoOperation,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { ProviderRepoService } from "./providers.types";

const { toRepoError: toProviderRepoError, mapSqlError } = makeMapSqlError<
  ProviderRepoOperation,
  ProviderRepoError
>((fields) => new ProviderRepoError(fields), "Failed to query providers");

export function makeSqlProvidersRepo(sql: SqlClient): ProviderRepoService {
  // ---------- channel_providers ----------

  const COLUMNS = sql.literal(
    "id, channel, name, is_active, kind, config, secret_keys, priority, created_at, updated_at, deleted_at",
  );

  // A unique-name violation is the one constraint the repo reports as a
  // domain error (only the database can detect that race-safely).
  const conflict = (name: string | undefined, operation: ProviderRepoOperation) =>
    <A>(effect: Effect.Effect<A, SqlError>): Effect.Effect<A, ChannelProviderConflict | ProviderRepoError> =>
      effect.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new ChannelProviderConflict({
              message: `A provider with name "${name}" already exists`,
            }),
          (_reasons, error) => Effect.fail(toProviderRepoError(operation, error)),
        ),
      );

  const addChannelProvider: ProviderRepoService["addChannelProvider"] =
    Effect.fn("ProvidersRepo.addChannelProvider")(function* (input) {
      const rows = yield* sql<ChannelProviderRecord>`
        INSERT INTO channel_providers
          (id, channel, name, kind, is_active, priority, config, secrets, secret_keys)
        VALUES (
          ${input.id}, ${input.channel}, ${input.name}, ${input.kind}, ${input.is_active},
          ${input.priority}, ${input.config}, ${input.secrets ? Buffer.from(input.secrets) : null},
          ${[...input.secret_keys]}
        )
        RETURNING ${COLUMNS}
      `.pipe(conflict(input.name, "addChannelProvider"));

      return new ChannelProviderRecord(rows[0]!);
    });

  const findChannelProviderById: ProviderRepoService["findChannelProviderById"] =
    Effect.fn("ProvidersRepo.findChannelProviderById")(function* (id) {
      const rows = yield* sql<ChannelProviderRecord>`
        SELECT ${COLUMNS}
        FROM channel_providers
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(mapSqlError("findChannelProviderById"));

      const row = rows[0];
      return row ? new ChannelProviderRecord(row) : null;
    });

  const findChannelProviderWithSecrets: ProviderRepoService["findChannelProviderWithSecrets"] =
    Effect.fn("ProvidersRepo.findChannelProviderWithSecrets")(function* (id) {
      const rows = yield* sql<ChannelProviderRecord & { readonly secrets: Uint8Array | null }>`
        SELECT ${COLUMNS}, secrets
        FROM channel_providers
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(mapSqlError("findChannelProviderById"));

      const row = rows[0];
      if (!row) return null;
      const { secrets, ...record } = row;
      return {
        record:  new ChannelProviderRecord(record),
        secrets: secrets ? new Uint8Array(secrets) : null,
      };
    });

  const listChannelProviders: ProviderRepoService["listChannelProviders"] =
    Effect.fn("ProvidersRepo.listChannelProviders")(function* (input) {
      const { skip, limit } = normalizePagination(input);
      const channel = input.channel ?? null;

      const rows = yield* sql<
        ChannelProviderRecord & { readonly total_count: number }
      >`
        SELECT ${COLUMNS},
               COUNT(*) OVER()::int AS total_count
        FROM channel_providers
        WHERE deleted_at IS NULL
          AND (${channel}::channel_type IS NULL OR channel = ${channel}::channel_type)
        ORDER BY channel, priority, name
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listChannelProviders"));

      return {
        items: rows.map(({ total_count: _total, ...row }) => new ChannelProviderRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
    });

  const updateChannelProvider: ProviderRepoService["updateChannelProvider"] =
    Effect.fn("ProvidersRepo.updateChannelProvider")(function* (id, input) {
      const setSecrets = input.secrets !== undefined;
      const blob       = input.secrets?.blob ? Buffer.from(input.secrets.blob) : null;
      const keys       = input.secrets ? [...input.secrets.keys] : [];

      const rows = yield* sql<ChannelProviderRecord>`
        UPDATE channel_providers
        SET
          name        = COALESCE(${input.name ?? null}, name),
          is_active   = COALESCE(${input.is_active ?? null}, is_active),
          priority    = COALESCE(${input.priority ?? null}::int, priority),
          config      = COALESCE(${input.config ?? null}::jsonb, config),
          secrets     = CASE WHEN ${setSecrets}::boolean THEN ${blob}::bytea ELSE secrets END,
          secret_keys = CASE WHEN ${setSecrets}::boolean THEN ${keys}::text[] ELSE secret_keys END,
          updated_at  = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING ${COLUMNS}
      `.pipe(conflict(input.name, "updateChannelProvider"));

      const row = rows[0];
      return row ? new ChannelProviderRecord(row) : null;
    });

  const deleteChannelProvider: ProviderRepoService["deleteChannelProvider"] =
    Effect.fn("ProvidersRepo.deleteChannelProvider")(function* (id) {
      const rows = yield* sql<{ id: string }>`
        UPDATE channel_providers
        SET deleted_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `.pipe(mapSqlError("deleteChannelProvider"));

      return rows.length > 0;
    });

  // ---------- provider_usage_log ----------

  const addProviderUsageLog: ProviderRepoService["addProviderUsageLog"] =
    Effect.fn("ProvidersRepo.addProviderUsageLog")(function* (input) {
      const rows = yield* sql<ProviderUsageLogRecord>`
        INSERT INTO provider_usage_log (delivery_id, provider_id, provider_ref_id, status_code, cost, raw_response)
        VALUES (${input.delivery_id}, ${input.provider_id}, ${input.provider_ref_id ?? null}, ${input.status_code ?? null}, ${input.cost ?? null}, ${input.raw_response ?? null})
        RETURNING id, delivery_id, provider_id, provider_ref_id, status_code, cost, raw_response, attempted_at
      `.pipe(mapSqlError("addProviderUsageLog"));

      return new ProviderUsageLogRecord(rows[0]!);
    });

  const listProviderUsageLogByDelivery: ProviderRepoService["listProviderUsageLogByDelivery"] =
    Effect.fn("ProvidersRepo.listProviderUsageLogByDelivery")(function* (
      deliveryId,
      input,
    ) {
      const { skip, limit } = normalizePagination(input);

      const rows = yield* sql<
        ProviderUsageLogRecord & { readonly total_count: number }
      >`
        SELECT id, delivery_id, provider_id, provider_ref_id, status_code, cost, raw_response, attempted_at,
               COUNT(*) OVER()::int AS total_count
        FROM provider_usage_log
        WHERE delivery_id = ${deliveryId}
        ORDER BY attempted_at ASC
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listProviderUsageLogByDelivery"));

      return {
        items: rows.map((row) => new ProviderUsageLogRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
    });

  return {
    addChannelProvider,
    findChannelProviderById,
    findChannelProviderWithSecrets,
    listChannelProviders,
    updateChannelProvider,
    deleteChannelProvider,
    addProviderUsageLog,
    listProviderUsageLogByDelivery,
  };
}
