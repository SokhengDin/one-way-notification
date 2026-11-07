import { Schema } from "effect";
import { assetContentTypeSchema, assetKindSchema } from "../enums";

export const MAX_ASSET_BYTES     = 2 * 1024 * 1024;
export const MAX_ASSET_DIMENSION = 8192;

export class BrandAssetRecord extends Schema.Class<BrandAssetRecord>(
  "BrandAssetRecord",
)({
  id:                 Schema.String,
  external_system_id: Schema.String,
  kind:               assetKindSchema,
  filename:           Schema.String,
  content_type:       assetContentTypeSchema,
  byte_size:          Schema.Int,
  width:              Schema.NullOr(Schema.Int),
  height:             Schema.NullOr(Schema.Int),
  sha256:             Schema.String,
  // path relative to the API base, e.g. /api/asset/<id>
  url:                Schema.String,
  created_at:         Schema.Date,
  updated_at:         Schema.NullOr(Schema.Date),
}) {}
