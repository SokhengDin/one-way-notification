import { Schema } from "effect";

export const AssetRepoOperation = Schema.Literals([
  "listAssets",
  "findAssetById",
  "findAssetData",
  "putAsset",
  "deleteAsset",
]);

export type AssetRepoOperation = typeof AssetRepoOperation.Type;

export class AssetRepoError extends Schema.TaggedErrorClass<AssetRepoError>()(
  "AssetRepoError",
  {
    message:    Schema.String,
    operation:  AssetRepoOperation,
    sqlState:   Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause:      Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

export class AssetNotFound extends Schema.TaggedErrorClass<AssetNotFound>()(
  "AssetNotFound",
  {
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

// The upload is not an acceptable image: unknown/mismatched format, too
// large, malformed, or an SVG carrying active content.
export class AssetInvalid extends Schema.TaggedErrorClass<AssetInvalid>()(
  "AssetInvalid",
  {
    message: Schema.String,
  },
  { httpApiStatus: 422 },
) {}
