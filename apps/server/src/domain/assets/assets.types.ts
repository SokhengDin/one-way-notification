import type { Effect } from "effect";
import type {
  AssetContentType,
  AssetInvalid,
  AssetKind,
  AssetNotFound,
  AssetRepoError,
  BrandAssetRecord,
  ExternalSystemNotFound,
} from "@repo/schema";

export interface InsertAsset {
  readonly external_system_id: string;
  readonly kind:               AssetKind;
  readonly filename:           string;
  readonly content_type:       AssetContentType;
  readonly width:              number | null;
  readonly height:             number | null;
  readonly sha256:             string;
  readonly data:               Uint8Array;
}

export interface UploadAsset {
  readonly filename:      string;
  readonly data:          string;
  readonly content_type?: AssetContentType;
}

export interface AssetFile {
  readonly id:           string;
  readonly filename:     string;
  readonly content_type: AssetContentType;
  readonly sha256:       string;
  readonly data:         Uint8Array;
}

export interface AssetRepoService {
  /** Current (not replaced, not deleted) assets of a system. */
  readonly listAssets: (
    externalSystemId: string,
  ) => Effect.Effect<ReadonlyArray<BrandAssetRecord>, AssetRepoError>;

  /** File bytes for any non-deleted asset, including replaced ones. */
  readonly findAssetFile: (
    id: string,
  ) => Effect.Effect<AssetFile | null, AssetRepoError>;

  /**
   * Insert a new asset, marking any current one of the same kind as replaced.
   * Returns null when the external system doesn't exist (or is deleted).
   */
  readonly putAsset: (
    input: InsertAsset,
  ) => Effect.Effect<BrandAssetRecord | null, AssetRepoError>;

  readonly deleteAsset: (
    externalSystemId: string,
    kind:             AssetKind,
  ) => Effect.Effect<boolean, AssetRepoError>;
}

export interface AssetsService {
  readonly listAssets: (
    externalSystemId: string,
  ) => Effect.Effect<ReadonlyArray<BrandAssetRecord>, AssetRepoError>;

  readonly getAssetFile: (
    id: string,
  ) => Effect.Effect<AssetFile, AssetNotFound | AssetRepoError>;

  readonly putAsset: (
    externalSystemId: string,
    kind:             AssetKind,
    input:            UploadAsset,
  ) => Effect.Effect<
    BrandAssetRecord,
    ExternalSystemNotFound | AssetInvalid | AssetRepoError
  >;

  readonly deleteAsset: (
    externalSystemId: string,
    kind:             AssetKind,
  ) => Effect.Effect<void, AssetNotFound | AssetRepoError>;
}
