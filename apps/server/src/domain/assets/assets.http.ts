import { Api, ok } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Assets } from "./assets";
import type { AssetFile } from "./assets.types";

// SVG is the one accepted format that is also a document. Even though
// uploads are screened for active content, serve it locked down so a direct
// navigation to the URL can't run anything.
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

const fileResponse = (file: AssetFile) =>
  HttpServerResponse.uint8Array(file.data, {
    contentType: file.content_type,
    headers: {
      "cache-control":          "public, max-age=31536000, immutable",
      "etag":                   `"${file.sha256}"`,
      "x-content-type-options": "nosniff",
      "content-disposition":    `inline; filename="${encodeURIComponent(file.filename)}"`,
      ...(file.content_type === "image/svg+xml" ? { "content-security-policy": SVG_CSP } : {}),
    },
  });

export const AssetsApiHandlers = HttpApiBuilder.group(
  Api,
  "assets",
  Effect.fn(function* (handlers) {
    const assets = yield* Assets;

    return handlers
      .handle("listAssets", ({ params }) =>
        assets.listAssets(params.id).pipe(Effect.map((data) => ok(data))),
      )
      .handle("putAsset", ({ params, payload }) =>
        assets
          .putAsset(params.id, params.kind, payload)
          .pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("deleteAsset", ({ params }) =>
        assets.deleteAsset(params.id, params.kind),
      )
      .handle("getAssetFile", ({ params }) =>
        assets.getAssetFile(params.id).pipe(Effect.map(fileResponse)),
      );
  }),
).pipe(Layer.provide(Assets.layer));
