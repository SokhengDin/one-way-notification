import type { Effect } from "effect";
import type {
  AssetContentType,
  AssetInvalid,
  AssetKind,
  AssetNotFound,
  AssetRepoError,
  BrandAssetRecord,
  ExternalSystemNotFound,
  FileStorageUnavailable,
} from "@repo/schema";

/** Where an asset's bytes live in file storage. */
export interface AssetStorageRef {
  readonly file_id:    string;
  readonly version_id: string;
}

export interface InsertAsset {
  /** chosen before the upload, so the file storage key can carry it */
  readonly id:                 string;
  readonly external_system_id: string;
  readonly kind:               AssetKind;
  readonly filename:           string;
  readonly content_type:       AssetContentType;
  readonly byte_size:          number;
  readonly width:              number | null;
  readonly height:             number | null;
  readonly sha256:             string;
  readonly storage:            AssetStorageRef;
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

/**
 * An asset row as the repo finds it: bytes in file storage, or (rows from
 * before migration 007 not yet moved) still in Postgres.
 */
export interface AssetFileLocation {
  readonly id:           string;
  readonly filename:     string;
  readonly content_type: AssetContentType;
  readonly sha256:       string;
  readonly location:
    | { readonly kind: "storage"; readonly storage: AssetStorageRef }
    | { readonly kind: "inline";  readonly data: Uint8Array };
}

export interface AssetRepoService {
  /** Current (not replaced, not deleted) assets of a system. */
  readonly listAssets: (
    externalSystemId: string,
  ) => Effect.Effect<ReadonlyArray<BrandAssetRecord>, AssetRepoError>;

  /** Where the bytes of any non-deleted asset are, including replaced ones. */
  readonly findAssetFile: (
    id: string,
  ) => Effect.Effect<AssetFileLocation | null, AssetRepoError>;

  /**
   * Insert a new asset, marking any current one of the same kind as replaced.
   * Returns null when the external system doesn't exist (or is deleted).
   */
  readonly putAsset: (
    input: InsertAsset,
  ) => Effect.Effect<BrandAssetRecord | null, AssetRepoError>;

  /**
   * Soft-delete the current asset of a kind. Returns where its bytes are in
   * file storage (null for a row still holding them inline), or false when
   * there was nothing to delete.
   */
  readonly deleteAsset: (
    externalSystemId: string,
    kind:             AssetKind,
  ) => Effect.Effect<{ readonly storage: AssetStorageRef | null } | false, AssetRepoError>;
}

export interface AssetsService {
  readonly listAssets: (
    externalSystemId: string,
  ) => Effect.Effect<ReadonlyArray<BrandAssetRecord>, AssetRepoError>;

  readonly getAssetFile: (
    id: string,
  ) => Effect.Effect<AssetFile, AssetNotFound | AssetRepoError | FileStorageUnavailable>;

  readonly putAsset: (
    externalSystemId: string,
    kind:             AssetKind,
    input:            UploadAsset,
  ) => Effect.Effect<
    BrandAssetRecord,
    ExternalSystemNotFound | AssetInvalid | AssetRepoError | FileStorageUnavailable
  >;

  readonly deleteAsset: (
    externalSystemId: string,
    kind:             AssetKind,
  ) => Effect.Effect<void, AssetNotFound | AssetRepoError>;
}
