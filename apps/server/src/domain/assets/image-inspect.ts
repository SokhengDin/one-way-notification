// Pure image inspection for uploaded brand assets: identify the format from
// the bytes (magic numbers, never the filename or a client-declared type),
// read the pixel dimensions, and reject SVGs that carry active content.

import {
  MAX_ASSET_BYTES,
  MAX_ASSET_DIMENSION,
  type AssetContentType,
} from "@repo/schema";

export interface ImageInfo {
  readonly contentType: AssetContentType;
  readonly width:       number | null;
  readonly height:      number | null;
}

export type InspectResult =
  | { readonly ok: true;  readonly info: ImageInfo }
  | { readonly ok: false; readonly reason: string };

const fail = (reason: string): InspectResult => ({ ok: false, reason });

// ---------- byte helpers ----------

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32be = (b: Uint8Array, o: number) =>
  ((b[o]! << 24) >>> 0) + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!);

// ---------- per-format dimension readers ----------

function pngSize(b: Uint8Array): [number, number] | null {
  // signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4)
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return [u32be(b, 16), u32be(b, 20)];
}

function gifSize(b: Uint8Array): [number, number] | null {
  if (b.length < 10) return null;
  return [u16le(b, 6), u16le(b, 8)];
}

function jpegSize(b: Uint8Array): [number, number] | null {
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) return null;
    const marker = b[offset + 1]!;
    // standalone markers without a length
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = u16be(b, offset + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return [u16be(b, offset + 7), u16be(b, offset + 5)];
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): [number, number] | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X") {
    return [u24le(b, 24) + 1, u24le(b, 27) + 1];
  }
  if (chunk === "VP8 ") {
    // keyframe start code 9d 01 2a, then 14-bit width/height
    if (!startsWith(b, [0x9d, 0x01, 0x2a], 23)) return null;
    return [u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff];
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  return null;
}

function icoSize(b: Uint8Array): [number, number] | null {
  // ICONDIR (6 bytes) then one 16-byte ICONDIRENTRY per image; width/height
  // bytes of 0 mean 256. Report the largest image the file contains.
  const count = b.length >= 6 ? u16le(b, 4) : 0;
  if (count === 0 || b.length < 6 + count * 16) return null;
  let best: [number, number] | null = null;
  for (let index = 0; index < count; index++) {
    const offset = 6 + index * 16;
    const width  = b[offset] === 0 ? 256 : b[offset]!;
    const height = b[offset + 1] === 0 ? 256 : b[offset + 1]!;
    if (best === null || width * height > best[0] * best[1]) best = [width, height];
  }
  return best;
}

// ---------- SVG ----------

// Anything that can execute script, load remote content, or expand entities.
const SVG_FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/<!ENTITY/i,                                       "entity declarations"],
  [/<script[\s>/]/i,                                   "<script> elements"],
  [/<foreignObject[\s>/]/i,                            "<foreignObject> elements"],
  [/<(iframe|embed|object|audio|video)[\s>/]/i,        "embedded content elements"],
  [/\son[a-z]+\s*=/i,                                  "event handler attributes"],
  [/(javascript|vbscript)\s*:/i,                       "script URLs"],
  [/data\s*:\s*text\/html/i,                           "HTML data URLs"],
  [/(?:xlink:)?href\s*=\s*["'](?!\s*(?:#|data:image\/))/i, "external references (only #fragment and data:image hrefs are allowed)"],
  [/@import/i,                                         "CSS @import"],
  [/url\((?!\s*["']?\s*(?:#|data:image\/))/i,                "external CSS url() references"],
];

function svgLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(value);
  return match ? Math.round(Number(match[1])) : null;
}

function inspectSvg(bytes: Uint8Array): InspectResult {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("SVG must be valid UTF-8 text");
  }

  for (const [pattern, label] of SVG_FORBIDDEN) {
    if (pattern.test(text)) {
      return fail(`SVG contains ${label}, which are not allowed`);
    }
  }

  const rootTag = /<svg\b([^>]*)>/i.exec(text);
  if (!rootTag) return fail("SVG has no <svg> root element");

  const attrs   = rootTag[1]!;
  const attr    = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(attrs)?.[1];
  let width     = svgLength(attr("width"));
  let height    = svgLength(attr("height"));
  const viewBox = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);

  if ((width === null || height === null) && viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    width  ??= Math.round(viewBox[2]!);
    height ??= Math.round(viewBox[3]!);
  }

  return { ok: true, info: { contentType: "image/svg+xml", width, height } };
}

/** Does the start of the file look like an SVG/XML document? */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 1024)).replace(/^﻿/, "");
  // skip XML declaration, comments and doctype before the root element
  // (a doctype may carry an internal subset in [...], which can contain ">")
  const stripped = head.replace(
    /^(\s*(<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>))*\s*/i,
    "",
  );
  return /^<svg[\s>]/i.test(stripped);
}

// ---------- entry point ----------

export function inspectImage(bytes: Uint8Array): InspectResult {
  if (bytes.length === 0) return fail("File is empty");
  if (bytes.length > MAX_ASSET_BYTES) {
    return fail(`File is ${bytes.length} bytes; the limit is ${MAX_ASSET_BYTES} bytes (2 MiB)`);
  }

  let contentType: AssetContentType;
  let size: [number, number] | null;

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    contentType = "image/png";
    size        = pngSize(bytes);
  } else if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    contentType = "image/jpeg";
    size        = jpegSize(bytes);
  } else if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    contentType = "image/gif";
    size        = gifSize(bytes);
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    contentType = "image/webp";
    size        = webpSize(bytes);
  } else if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) {
    contentType = "image/x-icon";
    size        = icoSize(bytes);
  } else if (looksLikeSvg(bytes)) {
    return inspectSvg(bytes);
  } else {
    return fail("Unsupported file type — upload a PNG, JPEG, GIF, WebP, SVG or ICO image");
  }

  if (size === null) {
    return fail(`File looks like ${contentType} but its header is truncated or corrupt`);
  }

  const [width, height] = size;
  if (width === 0 || height === 0) {
    return fail("Image has zero width or height");
  }
  if (width > MAX_ASSET_DIMENSION || height > MAX_ASSET_DIMENSION) {
    return fail(`Image is ${width}×${height}; the limit is ${MAX_ASSET_DIMENSION} pixels per side`);
  }

  return { ok: true, info: { contentType, width, height } };
}

/** Decode base64, tolerating a `data:<type>;base64,` prefix and whitespace. */
export function decodeBase64Payload(data: string): Uint8Array | null {
  const body = data.replace(/^data:[^;,]*;base64,/i, "").replace(/\s+/g, "");
  if (body.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body) || body.length % 4 === 1) {
    return null;
  }
  try {
    return Uint8Array.from(Buffer.from(body, "base64"));
  } catch {
    return null;
  }
}

/** Keep only a safe display filename: basename, no control chars, bounded. */
export function sanitizeFilename(filename: string): string {
  const base    = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (cleaned.length > 0 ? cleaned : "upload").slice(0, 255);
}
