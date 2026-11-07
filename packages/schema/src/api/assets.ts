import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { BrandAssetRecord } from "../assets/assets";
import { AssetInvalid, AssetNotFound, AssetRepoError } from "../assets/assets.errors";
import { assetContentTypeSchema, assetKindSchema } from "../enums";
import { ExternalSystemNotFound } from "../external-systems/external-systems.errors";
import { Uuid } from "../shared/ids";
import { ApiResponse } from "./response";

export class AssetsApiGroup extends HttpApiGroup.make("assets")
  .add(
    HttpApiEndpoint.get("listAssets", "/external-system/:id/asset", {
      params: { id: Uuid },
      success: ApiResponse(Schema.Array(BrandAssetRecord)),
      error: AssetRepoError,
    }),
    // Upload or replace the asset of one kind. Replacing keeps the previous
    // file servable at its old URL so emails already sent don't break.
    HttpApiEndpoint.put("putAsset", "/external-system/:id/asset/:kind", {
      params: { id: Uuid, kind: assetKindSchema },
      payload: Schema.Struct({
        filename:     Schema.String,
        // base64 (standard alphabet); a `data:...;base64,` prefix is accepted
        data:         Schema.String,
        // optional: if given it must match what the bytes actually are
        content_type: Schema.optional(assetContentTypeSchema),
      }),
      success: ApiResponse(BrandAssetRecord),
      error: [ExternalSystemNotFound, AssetInvalid, AssetRepoError],
    }),
    HttpApiEndpoint.make("DELETE")("deleteAsset", "/external-system/:id/asset/:kind", {
      params: { id: Uuid, kind: assetKindSchema },
      success: HttpApiSchema.NoContent,
      error: [AssetNotFound, AssetRepoError],
    }),
    // Raw bytes with the sniffed Content-Type. Asset URLs are immutable (a
    // replacement gets a new id), so they are cached aggressively.
    HttpApiEndpoint.get("getAssetFile", "/asset/:id", {
      params: { id: Uuid },
      success: Schema.Uint8Array.pipe(
        HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" }),
      ),
      error: [AssetNotFound, AssetRepoError],
    }),
  )
  .prefix("/api")
{}
