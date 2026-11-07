import {
  AssetRepoError,
  BrandAssetRecord,
  makeMapSqlError,
  type AssetContentType,
  type AssetRepoOperation,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { AssetRepoService } from "./assets.types";

const { mapSqlError } = makeMapSqlError<AssetRepoOperation, AssetRepoError>(
  (fields) => new AssetRepoError(fields),
  "Failed to query brand assets",
);

type AssetRow = Omit<BrandAssetRecord, "url">;

const toRecord = (row: AssetRow) =>
  new BrandAssetRecord({ ...row, url: `/api/asset/${row.id}` });

export function makeSqlAssetsRepo(sql: SqlClient): AssetRepoService {
  const listAssets: AssetRepoService["listAssets"] = Effect.fn(
    "AssetsRepo.listAssets",
  )(function* (externalSystemId) {
    const rows = yield* sql<AssetRow>`
      SELECT id, external_system_id, kind, filename, content_type, byte_size, width, height, sha256, created_at, updated_at
      FROM brand_assets
      WHERE external_system_id = ${externalSystemId}
        AND deleted_at IS NULL
        AND replaced_at IS NULL
      ORDER BY kind
    `.pipe(mapSqlError("listAssets"));

    return rows.map(toRecord);
  });

  const findAssetFile: AssetRepoService["findAssetFile"] = Effect.fn(
    "AssetsRepo.findAssetFile",
  )(function* (id) {
    const rows = yield* sql<{
      readonly id:           string;
      readonly filename:     string;
      readonly content_type: AssetContentType;
      readonly sha256:       string;
      readonly data:         Uint8Array;
    }>`
      SELECT id, filename, content_type, sha256, data
      FROM brand_assets
      WHERE id = ${id} AND deleted_at IS NULL
    `.pipe(mapSqlError("findAssetData"));

    const row = rows[0];
    return row ? { ...row, data: new Uint8Array(row.data) } : null;
  });

  const putAsset: AssetRepoService["putAsset"] = Effect.fn(
    "AssetsRepo.putAsset",
  )(function* (input) {
    const insert = Effect.gen(function* () {
      // Lock the owning system row: serialises concurrent uploads of the
      // same kind (so the partial unique index can't be raced) and confirms
      // the system exists and isn't soft-deleted.
      const systems = yield* sql<{ id: string }>`
        SELECT id FROM external_systems
        WHERE id = ${input.external_system_id} AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (systems.length === 0) {
        return null;
      }

      yield* sql`
        UPDATE brand_assets
        SET replaced_at = now(), updated_at = now()
        WHERE external_system_id = ${input.external_system_id}
          AND kind = ${input.kind}
          AND deleted_at IS NULL
          AND replaced_at IS NULL
      `;

      const rows = yield* sql<AssetRow>`
        INSERT INTO brand_assets
          (external_system_id, kind, filename, content_type, byte_size, width, height, sha256, data)
        VALUES (
          ${input.external_system_id}, ${input.kind}, ${input.filename}, ${input.content_type},
          ${input.data.byteLength}, ${input.width}, ${input.height}, ${input.sha256},
          ${Buffer.from(input.data)}
        )
        RETURNING id, external_system_id, kind, filename, content_type, byte_size, width, height, sha256, created_at, updated_at
      `;

      return toRecord(rows[0]!);
    });

    return yield* sql.withTransaction(insert).pipe(mapSqlError("putAsset"));
  });

  const deleteAsset: AssetRepoService["deleteAsset"] = Effect.fn(
    "AssetsRepo.deleteAsset",
  )(function* (externalSystemId, kind) {
    const rows = yield* sql<{ id: string }>`
      UPDATE brand_assets
      SET deleted_at = now(), updated_at = now()
      WHERE external_system_id = ${externalSystemId}
        AND kind = ${kind}
        AND deleted_at IS NULL
        AND replaced_at IS NULL
      RETURNING id
    `.pipe(mapSqlError("deleteAsset"));

    return rows.length > 0;
  });

  return { listAssets, findAssetFile, putAsset, deleteAsset };
}
