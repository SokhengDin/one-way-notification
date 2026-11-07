import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { MAX_ASSET_BYTES } from "@repo/schema";
import {
  decodeBase64Payload,
  inspectImage,
  sanitizeFilename,
} from "../src/domain/assets/image-inspect";

const fixture = async (name: string) =>
  new Uint8Array(await Bun.file(join(import.meta.dir, "fixtures", name)).arrayBuffer());

const svg = (markup: string) => new TextEncoder().encode(markup);

const expectInfo = (bytes: Uint8Array) => {
  const result = inspectImage(bytes);
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.info;
};

const expectRejected = (bytes: Uint8Array) => {
  const result = inspectImage(bytes);
  if (result.ok) throw new Error("expected rejection");
  return result.reason;
};

describe("raster formats are identified by their bytes", () => {
  test.each([
    ["logo.png",              "image/png",    480, 120],
    ["icon-48.png",           "image/png",     48,  48],
    ["logo.jpg",              "image/jpeg",   480, 120],
    ["logo-progressive.jpg",  "image/jpeg",   480, 120],
    ["logo.gif",              "image/gif",    240,  60],
    ["animated.gif",          "image/gif",    120, 120],
    ["logo-simple.webp",      "image/webp",   480, 120],
    ["logo-lossless.webp",    "image/webp",   480, 120],
    ["logo-lossy.webp",       "image/webp",   480, 120],
    ["icon.ico",              "image/x-icon",  64,  64],
  ])("%s → %s %ix%i", async (name, contentType, width, height) => {
    expect(expectInfo(await fixture(name))).toEqual({ contentType, width, height } as never);
  });

  test("the filename extension plays no part", async () => {
    // a PNG is a PNG no matter what it was called on upload
    expect(expectInfo(await fixture("logo.png")).contentType).toBe("image/png");
  });
});

describe("rejections", () => {
  test("empty file", () => {
    expect(expectRejected(new Uint8Array())).toBe("File is empty");
  });

  test("over the size limit", () => {
    const big = new Uint8Array(MAX_ASSET_BYTES + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(expectRejected(big)).toContain("limit is 2097152 bytes");
  });

  test("dimensions over the limit", async () => {
    expect(expectRejected(await fixture("too-wide.png"))).toContain("9000×10");
  });

  test("unsupported formats", () => {
    expect(expectRejected(svg("%PDF-1.7 ..."))).toContain("Unsupported file type");
    expect(expectRejected(svg("<html><body>hi</body></html>"))).toContain("Unsupported file type");
    expect(expectRejected(new Uint8Array([0x42, 0x4d, 0, 0, 0, 0]))).toContain("Unsupported"); // BMP
  });

  test("truncated headers", async () => {
    const png = await fixture("logo.png");
    expect(expectRejected(png.subarray(0, 12))).toContain("truncated or corrupt");
    const jpg = await fixture("logo.jpg");
    expect(expectRejected(jpg.subarray(0, 20))).toContain("truncated or corrupt");
  });
});

describe("SVG", () => {
  test("dimensions from width/height attributes", () => {
    const info = expectInfo(svg('<svg xmlns="http://www.w3.org/2000/svg" width="300px" height="80"><rect/></svg>'));
    expect(info).toEqual({ contentType: "image/svg+xml", width: 300, height: 80 });
  });

  test("dimensions fall back to the viewBox", () => {
    const info = expectInfo(svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120.5 40"/>'));
    expect(info).toMatchObject({ width: 121, height: 40 });
  });

  test("relative or missing sizes give null dimensions", () => {
    expect(expectInfo(svg('<svg width="100%" height="2em"/>'))).toMatchObject({ width: null, height: null });
  });

  test("XML declaration, BOM, comments and doctype before the root", () => {
    const markup =
      '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<!-- made by hand -->\n' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
    expect(expectInfo(svg(markup)).contentType).toBe("image/svg+xml");
  });

  test("safe internal references are allowed", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10">
      <defs><linearGradient id="g"><stop offset="0"/></linearGradient><path id="p" d="M0 0"/></defs>
      <rect fill="url(#g)" style="fill: url( '#g' )"/><use href="#p"/><use xlink:href="#p"/>
      <image href="data:image/png;base64,iVBORw0KGgo="/>
    </svg>`;
    expect(expectInfo(svg(markup)).contentType).toBe("image/svg+xml");
  });

  test.each([
    ["script element",       '<svg><script>alert(1)</script></svg>',                         "<script>"],
    ["self-closing script",  '<svg><script/></svg>',                                         "<script>"],
    ["event handler",        '<svg onload="alert(1)"/>',                                     "event handler"],
    ["uppercase handler",    '<svg><rect ONCLICK="x()"/></svg>',                             "event handler"],
    ["javascript href",      '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',  "script URLs"],
    ["foreignObject",        '<svg><foreignObject><div/></foreignObject></svg>',             "<foreignObject>"],
    ["iframe",               '<svg><iframe src="x"/></svg>',                                 "embedded content"],
    ["external image",       '<svg><image href="https://evil.test/track.png"/></svg>',       "external references"],
    ["external xlink",       '<svg><use xlink:href="https://evil.test/s.svg#a"/></svg>',     "external references"],
    ["external CSS url",     '<svg><rect style="fill:url(https://evil.test/x)"/></svg>',     "url()"],
    ["CSS import",           '<svg><style>@import "https://evil.test/x.css";</style></svg>', "@import"],
    ["entity declaration",   '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg>&a;</svg>', "entity"],
    ["html data url",        '<svg><a href="data:text/html,<script>x</script>"/></svg>',     "<script>"],
  ])("rejects %s", (_label, markup, reason) => {
    expect(expectRejected(svg(markup))).toContain(reason);
  });

  test("rejects invalid UTF-8", () => {
    const bytes = new Uint8Array([...new TextEncoder().encode("<svg>"), 0xff, 0xfe, ...new TextEncoder().encode("</svg>")]);
    expect(expectRejected(bytes)).toBe("SVG must be valid UTF-8 text");
  });
});

describe("decodeBase64Payload", () => {
  test("plain base64", () => {
    expect(decodeBase64Payload("aGVsbG8=")).toEqual(new TextEncoder().encode("hello"));
  });

  test("data URL prefix and line breaks are tolerated", () => {
    expect(decodeBase64Payload("data:image/png;base64,aGVs\nbG8=")).toEqual(new TextEncoder().encode("hello"));
  });

  test.each([[""], ["not base64!"], ["a"], ["data:image/png;base64,"]])("rejects %p", (input) => {
    expect(decodeBase64Payload(input)).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  test.each([
    ["logo.png",                   "logo.png"],
    ["C:\\Users\\me\\logo.png",    "logo.png"],
    ["../../etc/passwd",           "passwd"],
    ['we"ird\u0000\nname.svg',     "weirdname.svg"],
    ["   ",                        "upload"],
    ["",                           "upload"],
  ])("%p → %p", (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  test("is bounded to 255 characters", () => {
    expect(sanitizeFilename("a".repeat(300) + ".png")).toHaveLength(255);
  });
});
