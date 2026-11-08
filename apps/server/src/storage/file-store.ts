// Where this API keeps file bytes: file-vault, behind the `FileStore` service.
//
// The app depends on the `FileStore` tag only. Production provides
// `FileStore.fileVault` (configured from FILE_VAULT_*); tests provide an
// in-memory fake (test/support.ts → `fakeFiles`).
import { FileStorageUnavailable } from "@repo/schema";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { AppConfigLive, AppConfigService } from "../config/config";
import { FileVaultError, makeFileVaultClient, type FileVaultClient, type StoredFile } from "./file-vault-client";

export type { StoredFile } from "./file-vault-client";

export interface PutFile {
  /** path inside the space, e.g. brand-assets/<system>/<kind>/<id>.png */
  readonly key:         string;
  readonly contentType: string;
  readonly bytes:       Uint8Array;
}

export interface FileStoreService {
  readonly put:    (input: PutFile) => Effect.Effect<StoredFile, FileStorageUnavailable>;
  /** Bytes of exactly that version; null when file storage no longer has it. */
  readonly get:    (fileId: string, versionId: string) => Effect.Effect<Uint8Array | null, FileStorageUnavailable>;
  /** Move to file-vault's trash; already gone is fine. */
  readonly remove: (fileId: string) => Effect.Effect<void, FileStorageUnavailable>;
}

const PUBLIC_MESSAGE = "File storage is unavailable, try again later";

/**
 * Run one file-vault call. The detail (URL, status, network error) goes to
 * the log; callers only learn that file storage is unavailable, so internal
 * addresses and space ids never reach an API response.
 */
const vaultCall = <A>(span: string, call: () => Promise<A>) =>
  Effect.tryPromise({
    try:   call,
    catch: (cause) => (cause instanceof FileVaultError ? cause.message : `file storage failed: ${String(cause)}`),
  }).pipe(
    Effect.tapError((detail) => Effect.logWarning(`${span}: ${detail}`)),
    Effect.mapError(() => new FileStorageUnavailable({ message: PUBLIC_MESSAGE })),
    Effect.withSpan(span),
  );

const NOT_CONFIGURED = "File storage is not configured: set FILE_VAULT_URL and FILE_VAULT_API_KEY";

/**
 * Small in-process cache of recently served versions. Versions are
 * immutable, so entries never go stale; this only spares file-vault a round
 * trip when the same logo is fetched by many inboxes at once.
 */
function makeVersionCache(maxBytes: number) {
  const entries = new Map<string, Uint8Array>();
  let total     = 0;
  return {
    get(key: string) {
      const hit = entries.get(key);
      if (hit) {
        // most recently used goes last
        entries.delete(key);
        entries.set(key, hit);
      }
      return hit;
    },
    set(key: string, bytes: Uint8Array) {
      if (bytes.byteLength > maxBytes / 4 || entries.has(key)) return;
      entries.set(key, bytes);
      total += bytes.byteLength;
      for (const [oldest, value] of entries) {
        if (total <= maxBytes) break;
        entries.delete(oldest);
        total -= value.byteLength;
      }
    },
  };
}

export function makeFileStore(client: FileVaultClient, cacheBytes = 32 * 1024 * 1024): FileStoreService {
  const cache = makeVersionCache(cacheBytes);

  return {
    put: (input) => vaultCall("FileStore.put", () => client.put(input)),

    get: (fileId, versionId) => {
      const cacheKey = `${fileId}/${versionId}`;
      const hit      = cache.get(cacheKey);
      if (hit) return Effect.succeed(hit);
      return vaultCall("FileStore.get", () => client.get(fileId, versionId)).pipe(
        Effect.tap((bytes) => Effect.sync(() => bytes && cache.set(cacheKey, bytes))),
      );
    },

    remove: (fileId) => vaultCall("FileStore.remove", () => client.remove(fileId)),
  };
}

const unconfigured: FileStoreService = {
  put:    () => Effect.fail(new FileStorageUnavailable({ message: NOT_CONFIGURED })),
  get:    () => Effect.fail(new FileStorageUnavailable({ message: NOT_CONFIGURED })),
  remove: () => Effect.fail(new FileStorageUnavailable({ message: NOT_CONFIGURED })),
};

export class FileStore extends Context.Service<FileStore, FileStoreService>()(
  "app/storage/FileStore",
) {
  /** file-vault from FILE_VAULT_*, or a store that answers 503 when not configured. */
  static readonly fileVault = Layer.effect(
    FileStore,
    Effect.gen(function* () {
      const config = yield* AppConfigService;
      if (Option.isNone(config.fileVault)) {
        yield* Effect.logWarning(`${NOT_CONFIGURED}. Brand asset uploads will fail until it is.`);
        return unconfigured;
      }
      const vault = config.fileVault.value;
      return makeFileStore(
        makeFileVaultClient({
          baseUrl:   vault.url,
          apiKey:    Redacted.value(vault.apiKey),
          spaceId:   Option.getOrUndefined(vault.spaceId),
          spaceName: vault.spaceName,
          timeoutMs: vault.timeoutMs,
        }),
      );
    }),
  ).pipe(Layer.provide(AppConfigLive));
}
