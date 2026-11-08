// Moves brand assets uploaded before migration 007 out of Postgres into
// file-vault, one row at a time, then clears their `data` column.
//
//   bun run assets:move-to-file-vault            # move everything
//   bun run assets:move-to-file-vault --dry-run  # only count
//
// Safe to run again: only rows that still hold bytes are picked up, and each
// row is switched over in a single UPDATE after its upload succeeded. Asset
// ids and URLs don't change, so emails already sent keep their images.
// Deleted rows are left alone: they are never served.
import { SQL } from "bun";
import { Effect, Option, Redacted } from "effect";
import type { AssetContentType } from "@repo/schema";
import { AppConfigLive, AppConfigService } from "../src/config/config";
import { assetStorageKey } from "../src/domain/assets/assets";
import { makeFileVaultClient } from "../src/storage/file-vault-client";

const dryRun = process.argv.includes("--dry-run");

const program = Effect.gen(function* () {
  const config = yield* AppConfigService;
  if (Option.isNone(config.fileVault)) {
    return yield* Effect.fail(new Error("Set FILE_VAULT_URL and FILE_VAULT_API_KEY first"));
  }
  const vault = config.fileVault.value;

  const sql = new SQL({
    hostname: config.db.host,
    port:     config.db.port,
    database: config.db.name,
    username: config.db.user,
    password: Redacted.value(config.db.pass),
  });

  const client = makeFileVaultClient({
    baseUrl:   vault.url,
    apiKey:    Redacted.value(vault.apiKey),
    spaceId:   Option.getOrUndefined(vault.spaceId),
    spaceName: vault.spaceName,
    timeoutMs: vault.timeoutMs,
  });

  const pending = yield* Effect.tryPromise(() => sql<Array<{ id: string }>>`
    SELECT id FROM brand_assets
    WHERE data IS NOT NULL AND deleted_at IS NULL
    ORDER BY created_at
  `);
  yield* Effect.log(`${pending.length} asset(s) still stored in Postgres`);
  if (dryRun || pending.length === 0) {
    yield* Effect.tryPromise(() => sql.close());
    return;
  }

  yield* Effect.log(`file-vault space: ${yield* Effect.tryPromise(() => client.spaceId())}`);

  let moved = 0;
  for (const { id } of pending) {
    const [asset] = yield* Effect.tryPromise(() => sql<Array<{
      id: string; external_system_id: string; kind: string; content_type: AssetContentType; sha256: string; data: Uint8Array | null;
    }>>`
      SELECT id, external_system_id, kind, content_type, sha256, data
      FROM brand_assets WHERE id = ${id} AND data IS NOT NULL
    `);
    if (!asset || !asset.data) continue;

    const bytes  = new Uint8Array(asset.data);
    const stored = yield* Effect.tryPromise(() =>
      client.put({
        key:         assetStorageKey(asset.external_system_id, asset.kind, asset.id, asset.content_type),
        contentType: asset.content_type,
        bytes,
      }),
    );
    if (stored.sha256 !== null && stored.sha256 !== asset.sha256) {
      yield* Effect.tryPromise(() => client.remove(stored.fileId));
      return yield* Effect.fail(new Error(`SHA-256 mismatch for asset ${asset.id}; stopped, nothing changed for it`));
    }

    const updated = yield* Effect.tryPromise(() => sql`
      UPDATE brand_assets
      SET storage_file_id = ${stored.fileId}, storage_version_id = ${stored.versionId}, data = NULL
      WHERE id = ${asset.id} AND data IS NOT NULL
      RETURNING id
    `);
    if (updated.length === 0) {
      // moved by a concurrent run in the meantime
      yield* Effect.tryPromise(() => client.remove(stored.fileId));
      continue;
    }
    moved++;
    yield* Effect.log(`moved ${asset.id} (${asset.kind}, ${bytes.byteLength} bytes)`);
  }

  yield* Effect.log(`Done: ${moved} asset(s) moved to file-vault.`);
  yield* Effect.tryPromise(() => sql.close());
});

program.pipe(Effect.provide(AppConfigLive), Effect.runPromise).catch((error) => {
  console.error(error);
  process.exit(1);
});
