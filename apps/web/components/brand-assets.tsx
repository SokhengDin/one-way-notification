"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { ASSET_KINDS, MAX_ASSET_BYTES, type AssetKind, type BrandAssetRecord } from "@repo/schema";
import { cn } from "@/lib/utils";
import { assetFileUrl, deleteAsset, listAssets, putAsset, readFileAsDataUrl } from "../lib/api/assets";
import { errorMessage } from "../lib/errors";
import { Button } from "./button";
import { Card } from "./card";
import { ConfirmButton } from "./confirm-button";

const KIND_INFO: Record<AssetKind, { readonly label: string; readonly hint: string; readonly dark?: boolean }> = {
  logo:         { label: "Logo",         hint: "Shown at the top of emails. PNG or JPEG, ≥ 400px wide." },
  logo_dark:    { label: "Logo (dark)",  hint: "Variant for dark backgrounds. Available as {{system.logo_dark_url}}.", dark: true },
  icon:         { label: "Icon",         hint: "Square mark, e.g. 256×256. Available as {{system.icon_url}}." },
  email_header: { label: "Email header", hint: "Wide banner that replaces the logo in email headers." },
};

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico,.svg";

const FORMAT_LABEL: Record<BrandAssetRecord["content_type"], string> = {
  "image/png":     "PNG",
  "image/jpeg":    "JPEG",
  "image/gif":     "GIF",
  "image/webp":    "WebP",
  "image/svg+xml": "SVG",
  "image/x-icon":  "ICO",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function AssetSlot({
  systemId,
  kind,
  asset,
}: {
  readonly systemId: string;
  readonly kind:     AssetKind;
  readonly asset:    BrandAssetRecord | undefined;
}) {
  const queryClient = useQueryClient();
  const inputRef    = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const info = KIND_INFO[kind];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["brand-assets", systemId] });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // fail fast on the obvious; the server re-checks everything from the bytes
      if (file.size > MAX_ASSET_BYTES) {
        throw new Error(`${file.name} is ${formatBytes(file.size)}; the limit is 2 MB`);
      }
      return putAsset(systemId, kind, { filename: file.name, data: await readFileAsDataUrl(file) });
    },
    onMutate:  () => setError(null),
    onSuccess: () => {
      toast.success(`${info.label} ${asset ? "replaced" : "uploaded"}`);
      void invalidate();
    },
    onError: (err) => setError(errorMessage(err, "Upload failed")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAsset(systemId, kind),
    onSuccess:  () => {
      toast.success(`${info.label} removed`);
      void invalidate();
    },
    onError: (err) => setError(errorMessage(err, "Could not remove the asset")),
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid={`asset-slot-${kind}`}>
      <div>
        <h3 className="text-sm font-medium">{info.label}</h3>
        <p className="text-xs text-muted-foreground">{info.hint}</p>
      </div>

      <div
        className={cn(
          "flex h-28 items-center justify-center overflow-hidden rounded-md border",
          // checkerboard so transparency is visible; dark slot previews on dark
          info.dark
            ? "bg-zinc-900"
            : "bg-[conic-gradient(#f4f4f5_25%,#fff_0_50%,#f4f4f5_0_75%,#fff_0)] bg-[length:16px_16px]",
        )}
      >
        {asset ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the API, arbitrary formats incl. ICO/SVG
          <img
            src={assetFileUrl(asset)}
            alt={`${info.label} preview`}
            className="max-h-24 max-w-full object-contain"
          />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground/50" aria-label="No image" />
        )}
      </div>

      {asset ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs" data-testid={`asset-meta-${kind}`}>
          <dt className="text-muted-foreground">File</dt>
          <dd className="truncate" title={asset.filename}>{asset.filename}</dd>
          <dt className="text-muted-foreground">Format</dt>
          <dd>{FORMAT_LABEL[asset.content_type]}</dd>
          <dt className="text-muted-foreground">Size</dt>
          <dd>
            {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
            {formatBytes(asset.byte_size)}
          </dd>
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing uploaded.</p>
      )}

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      <div className="mt-auto flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          data-testid={`asset-input-${kind}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ""; // allow re-selecting the same file
            if (file) uploadMutation.mutate(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant={asset ? "outline" : "primary"}
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          <Upload className="size-3.5" />
          {uploadMutation.isPending ? "Uploading…" : asset ? "Replace" : "Upload"}
        </Button>
        {asset && (
          <ConfirmButton
            label="Remove"
            size="sm"
            variant="ghost"
            title={`Remove the ${info.label.toLowerCase()}?`}
            description="The file stops being served, so emails already sent will show a broken image. To change the image without breaking sent emails, use Replace instead."
            confirmLabel="Remove"
            pendingLabel="Removing…"
            isPending={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate()}
          />
        )}
      </div>
    </div>
  );
}

export function BrandAssets({ systemId }: { readonly systemId: string }) {
  const assetsQuery = useQuery({
    queryKey: ["brand-assets", systemId],
    queryFn:  () => listAssets(systemId),
  });

  const assets = assetsQuery.data?.data ?? [];

  return (
    <Card title="Brand assets">
      <p className="mb-4 text-sm text-muted-foreground">
        PNG, JPEG, GIF, WebP, SVG or ICO, up to 2 MB. Replacing a file keeps the old one available so emails
        already delivered still show their logo.
      </p>
      {assetsQuery.isError && (
        <p className="mb-4 text-sm text-destructive">{errorMessage(assetsQuery.error, "Could not load assets")}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ASSET_KINDS.map((kind) => (
          <AssetSlot key={kind} systemId={systemId} kind={kind} asset={assets.find((a) => a.kind === kind)} />
        ))}
      </div>
    </Card>
  );
}
