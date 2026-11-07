import { AssetInvalid, AssetNotFound, ExternalSystemNotFound } from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
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

export class Assets extends Context.Service<Assets, AssetsService>()(
  "app/domain/assets/Assets",
) {
  static readonly layer = Layer.effect(
    Assets,
    Effect.gen(function* () {
      const repo = yield* AssetsRepo;

      const listAssets: AssetsService["listAssets"] = Effect.fn(
        "Assets.listAssets",
      )(function* (externalSystemId) {
        return yield* repo.listAssets(externalSystemId);
      });

      const getAssetFile: AssetsService["getAssetFile"] = Effect.fn(
        "Assets.getAssetFile",
      )(function* (id) {
        const file = yield* repo.findAssetFile(id);
        if (file === null) {
          return yield* new AssetNotFound({ id });
        }
        return file;
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

          const record = yield* repo.putAsset({
            external_system_id: externalSystemId,
            kind,
            filename:           sanitizeFilename(input.filename),
            content_type:       info.contentType,
            width:              info.width,
            height:             info.height,
            sha256:             sha256Hex(bytes),
            data:               bytes,
          });

          if (record === null) {
            return yield* new ExternalSystemNotFound({ id: externalSystemId });
          }
          return record;
        },
      );

      const deleteAsset: AssetsService["deleteAsset"] = Effect.fn(
        "Assets.deleteAsset",
      )(function* (externalSystemId, kind) {
        const deleted = yield* repo.deleteAsset(externalSystemId, kind);
        if (!deleted) {
          return yield* new AssetNotFound({ id: `${externalSystemId}/${kind}` });
        }
      });

      return { listAssets, getAssetFile, putAsset, deleteAsset };
    }),
  ).pipe(Layer.provide(AssetsRepo.layer));
}
