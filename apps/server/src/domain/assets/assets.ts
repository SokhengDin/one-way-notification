import {
  AssetInvalid,
  AssetNotFound,
  ExternalSystemNotFound,
  FileStorageUnavailable,
  type AssetContentType,
} from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { FileStore } from "../../storage/file-store";
import { makeSqlAssetsRepo } from "./assets.sql";
import type {
  AssetRepoService as AssetRepoServiceShape,
  AssetsService,
} from "./assets.types";
import { decodeBase64Payload, inspectImage, sanitizeFilename } from "./image-inspect";

export class AssetsRepo extends Context.Service<AssetsRepo, AssetRepoServiceShape>()(
  "app/domain/assets/AssetsRepo",
) {
  static readonly layer = Layer.effect(
    AssetsRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlAssetsRepo(sql);
    }),
  );
}

const sha256Hex = (bytes: Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

const EXTENSIONS: Record<AssetContentType, string> = {
  "image/png":     "png",
  "image/jpeg":    "jpg",
  "image/gif":     "gif",
  "image/webp":    "webp",
  "image/svg+xml": "svg",
  "image/x-icon":  "ico",
};

/** Key in the file storage space. Unique per asset, so every upload is a new file. */
export const assetStorageKey = (
  externalSystemId: string,
  kind:             string,
  id:               string,
  contentType:      AssetContentType,
) => `brand-assets/${externalSystemId}/${kind}/${id}.${EXTENSIONS[contentType]}`;

export class Assets extends Context.Service<Assets, AssetsService>()(
  "app/domain/assets/Assets",
) {
  static readonly layer = Layer.effect(
    Assets,
    Effect.gen(function* () {
      const repo  = yield* AssetsRepo;
      const files = yield* FileStore;

      // Best effort: the row is the source of truth, and a stray file in
      // file-vault's trash is purged by its own retention.
      const discardStored = (fileId: string) =>
        files.remove(fileId).pipe(
          Effect.catchTag("FileStorageUnavailable", (error) =>
            Effect.logWarning(`Could not remove file ${fileId} from file storage`, error.message),
          ),
        );

      const listAssets: AssetsService["listAssets"] = Effect.fn(
        "Assets.listAssets",
      )(function* (externalSystemId) {
        return yield* repo.listAssets(externalSystemId);
      });

      const getAssetFile: AssetsService["getAssetFile"] = Effect.fn(
        "Assets.getAssetFile",
      )(function* (id) {
        const found = yield* repo.findAssetFile(id);
        if (found === null) {
          return yield* new AssetNotFound({ id });
        }

        const { location, ...file } = found;
        if (location.kind === "inline") {
          // uploaded before file storage, not moved yet
          return { ...file, data: location.data };
        }

        const data = yield* files.get(location.storage.file_id, location.storage.version_id);
        if (data === null) {
          yield* Effect.logWarning(
            `Asset ${id} points at file ${location.storage.file_id} version ${location.storage.version_id}, which file storage no longer has`,
          );
          return yield* new AssetNotFound({ id });
        }
        return { ...file, data };
      });

      const putAsset: AssetsService["putAsset"] = Effect.fn("Assets.putAsset")(
        function* (externalSystemId, kind, input) {
          const bytes = decodeBase64Payload(input.data);
          if (bytes === null) {
            return yield* new AssetInvalid({ message: "data must be a non-empty base64 string" });
          }

          const inspected = inspectImage(bytes);
          if (!inspected.ok) {
            return yield* new AssetInvalid({ message: inspected.reason });
          }

          const { info } = inspected;
          if (input.content_type !== undefined && input.content_type !== info.contentType) {
            return yield* new AssetInvalid({
              message: `Declared content_type ${input.content_type} does not match the file, which is ${info.contentType}`,
            });
          }

          const id     = crypto.randomUUID();
          const sha256 = sha256Hex(bytes);

          // bytes first, row second: a row never points at a file that isn't there
          const stored = yield* files.put({
            key:         assetStorageKey(externalSystemId, kind, id, info.contentType),
            contentType: info.contentType,
            bytes,
          });

          if (stored.sha256 !== null && stored.sha256 !== sha256) {
            yield* discardStored(stored.fileId);
            return yield* new FileStorageUnavailable({
              message: "File storage returned a different SHA-256 than the uploaded bytes",
            });
          }

          const record = yield* repo.putAsset({
            id,
            external_system_id: externalSystemId,
            kind,
            filename:           sanitizeFilename(input.filename),
            content_type:       info.contentType,
            byte_size:          bytes.byteLength,
            width:              info.width,
            height:             info.height,
            sha256,
            storage:            { file_id: stored.fileId, version_id: stored.versionId },
          }).pipe(Effect.onError(() => discardStored(stored.fileId)));

          if (record === null) {
            yield* discardStored(stored.fileId);
            return yield* new ExternalSystemNotFound({ id: externalSystemId });
          }
          return record;
        },
      );

      const deleteAsset: AssetsService["deleteAsset"] = Effect.fn(
        "Assets.deleteAsset",
      )(function* (externalSystemId, kind) {
        const deleted = yield* repo.deleteAsset(externalSystemId, kind);
        if (deleted === false) {
          return yield* new AssetNotFound({ id: `${externalSystemId}/${kind}` });
        }
        // Only the current asset is deleted; earlier, replaced versions keep
        // their files because emails already sent still show them.
        if (deleted.storage !== null) {
          yield* discardStored(deleted.storage.file_id);
        }
      });

      return { listAssets, getAssetFile, putAsset, deleteAsset };
    }),
  ).pipe(Layer.provide(AssetsRepo.layer));
}
