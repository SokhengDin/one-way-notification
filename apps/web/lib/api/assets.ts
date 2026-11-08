import type { AssetContentType, AssetKind, BrandAssetRecord } from "@repo/schema";
import { PROXY_PATH, runApi } from "../api-client";

export const listAssets = (externalSystemId: string) =>
  runApi((client) => client.assets.listAssets({ params: { id: externalSystemId } }));

export const putAsset = (
  externalSystemId: string,
  kind: AssetKind,
  payload: { filename: string; data: string; content_type?: AssetContentType },
) =>
  runApi((client) =>
    client.assets.putAsset({ params: { id: externalSystemId, kind }, payload }),
  );

export const deleteAsset = (externalSystemId: string, kind: AssetKind) =>
  runApi((client) =>
    client.assets.deleteAsset({ params: { id: externalSystemId, kind } }),
  );

/** Absolute URL of an asset's file, for <img src>. */
export const assetFileUrl = (asset: Pick<BrandAssetRecord, "url">) => `${PROXY_PATH}${asset.url}`;

/** Read a File as a data: URL (the API accepts the prefix as-is). */
export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
