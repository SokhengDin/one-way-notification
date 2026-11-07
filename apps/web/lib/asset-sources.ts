// Where the template editor's `@image` suggestions come from.
//
// Each source answers a text query with insertable suggestions. The editor
// asks every source in ASSET_SOURCES and groups results by source, so adding
// a backend is one new object in that list:
//
//   const fileApiSource: AssetSource = {
//     id:     "files",
//     label:  "Files",
//     search: async (query, { externalSystemId }) => {
//       const files = await searchFiles({ q: query, external_system_id: externalSystemId });
//       return files.map((file) => imageSuggestion({ ... }));
//     },
//   };
//
// (The file API doesn't exist yet; brand assets are the only source today.)
//
// `search` is called once when the menu opens, with whatever follows the
// "@" so far (usually nothing). The editor then narrows that list by label
// as the user types, and calls `search` again only if the query no longer
// extends the fetched one — so a source should return its best matches for
// the query, not necessarily everything.

import type { AssetKind, BrandAssetRecord, ChannelType } from "@repo/schema";
import { assetFileUrl, listAssets } from "./api/assets";

export interface AssetSuggestion {
  readonly id:            string;
  /** shown in the menu, also what the query matches against */
  readonly label:         string;
  /** secondary line: format, size, origin */
  readonly detail:        string;
  readonly thumbnailUrl?: string;
  /** inserted into email (HTML) templates */
  readonly html:          string;
  /** inserted into sms / telegram templates */
  readonly text:          string;
  /** extra words the query may match (filename, kind, …) */
  readonly keywords?:     ReadonlyArray<string>;
}

export interface AssetSearchContext {
  readonly externalSystemId: string;
  readonly channel:          ChannelType;
}

export interface AssetSource {
  readonly id:     string;
  readonly label:  string;
  readonly search: (query: string, context: AssetSearchContext) => Promise<ReadonlyArray<AssetSuggestion>>;
}

// ---------- helpers ----------

const ATTRIBUTE_ESCAPES: Record<string, string> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };
const escapeAttribute = (value: string) => value.replace(/[&"<>]/g, (char) => ATTRIBUTE_ESCAPES[char]!);

/** An email-safe <img> tag: explicit width, block display, no border. */
export function imageTag(src: string, alt: string, width: number | null): string {
  const widthAttribute = width ? ` width="${width}"` : "";
  return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}"${widthAttribute} style="display:block;border:0;max-width:100%;height:auto;">`;
}

/** Case-insensitive subsequence match: "elog" matches "email header logo". */
export function matchesQuery(query: string, ...haystack: ReadonlyArray<string>): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const text = haystack.join(" ").toLowerCase();
  if (text.includes(needle)) return true;
  let position = 0;
  for (const char of needle) {
    position = text.indexOf(char, position);
    if (position === -1) return false;
    position += 1;
  }
  return true;
}

// ---------- brand assets ----------

const KIND_LABEL: Record<AssetKind, string> = {
  logo:         "Logo",
  logo_dark:    "Logo (dark)",
  icon:         "Icon",
  email_header: "Email header",
};

// Inserted sizes; the email layout's own header logo is capped at 200px.
const KIND_MAX_WIDTH: Record<AssetKind, number> = {
  logo:         200,
  logo_dark:    200,
  icon:         64,
  email_header: 600,
};

const FORMAT: Record<BrandAssetRecord["content_type"], string> = {
  "image/png":     "PNG",
  "image/jpeg":    "JPEG",
  "image/gif":     "GIF",
  "image/webp":    "WebP",
  "image/svg+xml": "SVG",
  "image/x-icon":  "ICO",
};

export function brandAssetSuggestion(asset: BrandAssetRecord): AssetSuggestion {
  // Reference the stable {{system.*_url}} variable, not the file's URL:
  // replacing the logo later updates every template that uses it.
  const variable = `{{system.${asset.kind}_url}}`;
  const width    = asset.width ? Math.min(asset.width, KIND_MAX_WIDTH[asset.kind]) : KIND_MAX_WIDTH[asset.kind];
  const size     = asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : "";

  return {
    id:           asset.id,
    label:        KIND_LABEL[asset.kind],
    detail:       `${FORMAT[asset.content_type]}${size} · ${asset.filename}`,
    thumbnailUrl: assetFileUrl(asset),
    html:         imageTag(variable, `{{system.name}} ${KIND_LABEL[asset.kind].toLowerCase()}`, width),
    text:         variable,
    keywords:     [asset.kind, asset.filename, "brand", "image"],
  };
}

export const brandAssetSource: AssetSource = {
  id:    "brand-assets",
  label: "Brand assets",
  search: async (query, { externalSystemId }) => {
    if (!externalSystemId) return [];
    const response = await listAssets(externalSystemId);
    return response.data
      .map(brandAssetSuggestion)
      .filter((suggestion) => matchesQuery(query, suggestion.label, ...(suggestion.keywords ?? [])));
  },
};

/** Every source the editor queries, in display order. */
export const ASSET_SOURCES: ReadonlyArray<AssetSource> = [brandAssetSource];

/** Query every source; a failing source is skipped rather than failing all. */
export async function searchAssets(
  query:   string,
  context: AssetSearchContext,
  sources: ReadonlyArray<AssetSource> = ASSET_SOURCES,
): Promise<ReadonlyArray<{ readonly source: AssetSource; readonly suggestion: AssetSuggestion }>> {
  const results = await Promise.allSettled(sources.map((source) => source.search(query, context)));
  return results.flatMap((result, index) =>
    result.status === "fulfilled" ? result.value.map((suggestion) => ({ source: sources[index]!, suggestion })) : [],
  );
}
