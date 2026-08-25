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
import type { ProviderRepoService } from "./providers.types";

const { toRepoError: toProviderRepoError, mapSqlError } = makeMapSqlError<
  ProviderRepoOperation,
  ProviderRepoError
>((fields) => new ProviderRepoError(fields), "Failed to query providers");

export function makeSqlProvidersRepo(sql: SqlClient): ProviderRepoService {
  // ---------- channel_providers ----------

  const addChannelProvider: ProviderRepoService["addChannelProvider"] =
    Effect.fn("ProvidersRepo.addChannelProvider")(function* (input) {
      const rows = yield* sql<ChannelProviderRecord>`
        INSERT INTO channel_providers (channel, name, is_active)
        VALUES (${input.channel}, ${input.name}, ${input.is_active ?? true})
        RETURNING id, channel, name, is_active, created_at, updated_at, deleted_at
      `.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new ChannelProviderConflict({
              message: `A provider with name "${input.name}" already exists`,
            }),
          (_reasons, error) =>
            Effect.fail(toProviderRepoError("addChannelProvider", error)),
        ),
      );

      return new ChannelProviderRecord(rows[0]!);
    });

  const findChannelProviderById: ProviderRepoService["findChannelProviderById"] =
    Effect.fn("ProvidersRepo.findChannelProviderById")(function* (id) {
      const rows = yield* sql<ChannelProviderRecord>`
        SELECT id, channel, name, is_active, created_at, updated_at, deleted_at
        FROM channel_providers
        WHERE id = ${id} AND deleted_at IS NULL
      `.pipe(mapSqlError("findChannelProviderById"));

      const row = rows[0];
      return row ? new ChannelProviderRecord(row) : null;
    });

  const listChannelProviders: ProviderRepoService["listChannelProviders"] =
    Effect.fn("ProvidersRepo.listChannelProviders")(function* (input) {
      const { skip, limit } = normalizePagination(input);

      const rows = yield* sql<
        ChannelProviderRecord & { readonly total_count: number }
      >`
        SELECT id, channel, name, is_active, created_at, updated_at, deleted_at,
               COUNT(*) OVER()::int AS total_count
        FROM channel_providers
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${skip}
      `.pipe(mapSqlError("listChannelProviders"));

      return {
        items: rows.map((row) => new ChannelProviderRecord(row)),
        total: rows[0]?.total_count ?? 0,
        skip,
        limit,
      };
    });

  const updateChannelProvider: ProviderRepoService["updateChannelProvider"] =
    Effect.fn("ProvidersRepo.updateChannelProvider")(function* (id, input) {
      const rows = yield* sql<ChannelProviderRecord>`
        UPDATE channel_providers
        SET
          name = COALESCE(${input.name ?? null}, name),
          is_active = COALESCE(${input.is_active ?? null}, is_active),
          updated_at = now()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id, channel, name, is_active, created_at, updated_at, deleted_at
      `.pipe(
        Effect.catchReason(
          "SqlError",
          "UniqueViolation",
          () =>
            new ChannelProviderConflict({
              message: `A provider with name "${input.name}" already exists`,
            }),
          (_reasons, error) =>
            Effect.fail(toProviderRepoError("updateChannelProvider", error)),
        ),
      );

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
    listChannelProviders,
    updateChannelProvider,
    deleteChannelProvider,
    addProviderUsageLog,
    listProviderUsageLogByDelivery,
  };
}
