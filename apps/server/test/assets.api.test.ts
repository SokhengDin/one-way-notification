import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { api, createSystem, createTemplate, resetDb, testSql } from "./support";

const NIL_UUID = "00000000-0000-4000-8000-000000000000";

beforeEach(resetDb);

const fixtureBytes = async (name: string) =>
  new Uint8Array(await Bun.file(join(import.meta.dir, "fixtures", name)).arrayBuffer());
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const svgB64 = (markup: string) => Buffer.from(markup).toString("base64");

const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"><rect width="300" height="80" fill="#2563eb"/></svg>';

async function upload(systemId: string, kind: string, file: string, extra: Record<string, unknown> = {}) {
  return api("PUT", `/api/external-system/${systemId}/asset/${kind}`, {
    filename: file,
    data:     b64(await fixtureBytes(file)),
    ...extra,
  });
}

describe("upload every supported format", () => {
  test.each([
    ["logo.png",             "image/png",    480, 120],
    ["logo.jpg",             "image/jpeg",   480, 120],
    ["logo-progressive.jpg", "image/jpeg",   480, 120],
    ["logo.gif",             "image/gif",    240,  60],
    ["animated.gif",         "image/gif",    120, 120],
    ["logo-simple.webp",     "image/webp",   480, 120],
    ["logo-lossless.webp",   "image/webp",   480, 120],
    ["logo-lossy.webp",      "image/webp",   480, 120],
    ["icon.ico",             "image/x-icon",  64,  64],
  ])("%s", async (file, contentType, width, height) => {
    const system = await createSystem();
    const bytes  = await fixtureBytes(file);
    const res    = await upload(system.id, "logo", file);

    expect(res.status).toBe(200);
    expect(res.json.status).toBe(201);
    const record = res.json.data;
    expect(record).toMatchObject({
      external_system_id: system.id,
      kind:               "logo",
      filename:           file,
      content_type:       contentType,
      byte_size:          bytes.length,
      width,
      height,
      sha256:             new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      url:                `/api/asset/${record.id}`,
    });

    // round-trips byte for byte with the sniffed type
    const file$ = await api("GET", record.url);
    expect(file$.status).toBe(200);
    expect(file$.headers.get("content-type")).toBe(contentType);
    expect(file$.bytes).toEqual(bytes);
  });

  test("SVG", async () => {
    const system = await createSystem();
    const res    = await api("PUT", `/api/external-system/${system.id}/asset/logo`, {
      filename: "logo.svg", data: svgB64(SAFE_SVG),
    });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ content_type: "image/svg+xml", width: 300, height: 80 });
  });

  test("a data: URL is accepted as the data field", async () => {
    const system = await createSystem();
    const res    = await api("PUT", `/api/external-system/${system.id}/asset/icon`, {
      filename: "icon.png", data: `data:image/png;base64,${b64(await fixtureBytes("icon-48.png"))}`,
    });
    expect(res.status).toBe(200);
    expect(res.json.data.content_type).toBe("image/png");
  });
});

describe("every asset kind", () => {
  test("logo, logo_dark, icon and email_header coexist and list together", async () => {
    const system = await createSystem();
    await upload(system.id, "logo",         "logo.png");
    await upload(system.id, "logo_dark",    "logo.jpg");
    await upload(system.id, "icon",         "icon.ico");
    await upload(system.id, "email_header", "logo-simple.webp");

    const res = await api("GET", `/api/external-system/${system.id}/asset`);
    expect(res.status).toBe(200);
    expect(res.json.data.map((a: { kind: string; content_type: string }) => [a.kind, a.content_type])).toEqual([
      ["logo",         "image/png"],
      ["logo_dark",    "image/jpeg"],
      ["icon",         "image/x-icon"],
      ["email_header", "image/webp"],
    ]);
    // metadata only — never the bytes
    expect(res.json.data[0]).not.toHaveProperty("data");
  });

  test("unknown kind → 400", async () => {
    const system = await createSystem();
    expect((await upload(system.id, "favicon", "logo.png")).status).toBe(400);
  });

  test("assets are scoped to their system", async () => {
    const a = await createSystem();
    const b = await createSystem();
    await upload(a.id, "logo", "logo.png");
    expect((await api("GET", `/api/external-system/${b.id}/asset`)).json.data).toEqual([]);
  });
});

describe("replace", () => {
  test("uploading the same kind again replaces it with a new id", async () => {
    const system = await createSystem();
    const first  = (await upload(system.id, "logo", "logo.png")).json.data;
    const second = (await upload(system.id, "logo", "logo.jpg")).json.data;

    expect(second.id).not.toBe(first.id);
    expect(second.content_type).toBe("image/jpeg");

    const list = (await api("GET", `/api/external-system/${system.id}/asset`)).json.data;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(second.id);
  });

  test("the replaced file stays servable so sent emails keep their logo", async () => {
    const system = await createSystem();
    const first  = (await upload(system.id, "logo", "logo.png")).json.data;
    await upload(system.id, "logo", "logo.jpg");

    const old = await api("GET", first.url);
    expect(old.status).toBe(200);
    expect(old.headers.get("content-type")).toBe("image/png");
  });

  test("concurrent uploads of one kind leave exactly one current asset", async () => {
    const system = await createSystem();
    const files  = ["logo.png", "logo.jpg", "logo.gif", "logo-simple.webp", "icon.ico"];
    const results = await Promise.all(files.map((file) => upload(system.id, "logo", file)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);

    const list = (await api("GET", `/api/external-system/${system.id}/asset`)).json.data;
    expect(list).toHaveLength(1);
    const [{ current }] = await testSql`
      SELECT count(*)::int AS current FROM brand_assets
      WHERE external_system_id = ${system.id} AND replaced_at IS NULL AND deleted_at IS NULL
    `;
    expect(current).toBe(1);
  });
});

describe("delete", () => {
  test("204, removed from the list and no longer served", async () => {
    const system = await createSystem();
    const asset  = (await upload(system.id, "logo", "logo.png")).json.data;

    const res = await api("DELETE", `/api/external-system/${system.id}/asset/logo`);
    expect(res.status).toBe(204);
    expect((await api("GET", `/api/external-system/${system.id}/asset`)).json.data).toEqual([]);
    expect((await api("GET", asset.url)).status).toBe(404);
  });

  test("deleting again, or a kind never uploaded → 404", async () => {
    const system = await createSystem();
    await upload(system.id, "logo", "logo.png");
    await api("DELETE", `/api/external-system/${system.id}/asset/logo`);
    expect((await api("DELETE", `/api/external-system/${system.id}/asset/logo`)).status).toBe(404);
    expect((await api("DELETE", `/api/external-system/${system.id}/asset/icon`)).status).toBe(404);
  });

  test("deleting one kind leaves the others", async () => {
    const system = await createSystem();
    await upload(system.id, "logo", "logo.png");
    await upload(system.id, "icon", "icon.ico");
    await api("DELETE", `/api/external-system/${system.id}/asset/logo`);
    const list = (await api("GET", `/api/external-system/${system.id}/asset`)).json.data;
    expect(list.map((a: { kind: string }) => a.kind)).toEqual(["icon"]);
  });

  test("a kind can be uploaded again after delete", async () => {
    const system = await createSystem();
    await upload(system.id, "logo", "logo.png");
    await api("DELETE", `/api/external-system/${system.id}/asset/logo`);
    expect((await upload(system.id, "logo", "logo.gif")).status).toBe(200);
  });
});

describe("serving", () => {
  test("immutable caching, ETag, nosniff and inline filename", async () => {
    const system = await createSystem();
    const asset  = (await upload(system.id, "logo", "logo.png")).json.data;
    const res    = await api("GET", asset.url);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("etag")).toBe(`"${asset.sha256}"`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="logo.png"');
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  test("SVGs are served under a sandboxing CSP", async () => {
    const system = await createSystem();
    const asset  = (await api("PUT", `/api/external-system/${system.id}/asset/logo`, {
      filename: "l.svg", data: svgB64(SAFE_SVG),
    })).json.data;
    const res = await api("GET", asset.url);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  test("unknown id → 404, malformed → 400", async () => {
    expect((await api("GET", `/api/asset/${NIL_UUID}`)).status).toBe(404);
    expect((await api("GET", "/api/asset/logo.png")).status).toBe(400);
  });

  test("filenames are sanitised before storage", async () => {
    const system = await createSystem();
    const res    = await upload(system.id, "logo", "logo.png", { filename: '../../x/"evil"\n.png' });
    expect(res.json.data.filename).toBe("evil.png");
  });
});

describe("rejected uploads", () => {
  const expect422 = async (body: Record<string, unknown>, message: string) => {
    const system = await createSystem();
    const res    = await api("PUT", `/api/external-system/${system.id}/asset/logo`, { filename: "f", ...body });
    expect(res.status).toBe(422);
    expect(res.json._tag).toBe("AssetInvalid");
    expect(res.json.message).toContain(message);
    // and nothing was stored
    expect((await api("GET", `/api/external-system/${system.id}/asset`)).json.data).toEqual([]);
  };

  test("not base64", () => expect422({ data: "%%%" }, "base64"));
  test("empty", () => expect422({ data: "" }, "base64"));
  test("not an image", () => expect422({ data: Buffer.from("%PDF-1.4").toString("base64") }, "Unsupported file type"));
  test("too big", () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return expect422({ data: b64(big) }, "limit is 2097152 bytes");
  });
  test("too many pixels", async () => expect422({ data: b64(await fixtureBytes("too-wide.png")) }, "9000×10"));
  test("SVG with script", () => expect422({ data: svgB64("<svg><script>alert(1)</script></svg>") }, "<script>"));
  test("SVG with event handler", () => expect422({ data: svgB64('<svg onload="x()"/>') }, "event handler"));
  test("SVG with remote image", () => expect422({ data: svgB64('<svg><image href="https://t.test/p"/></svg>') }, "external references"));

  test("declared content_type that doesn't match the bytes", async () =>
    expect422(
      { data: b64(await fixtureBytes("logo.jpg")), content_type: "image/png" },
      "Declared content_type image/png does not match the file, which is image/jpeg",
    ));

  test("declared content_type that matches is accepted", async () => {
    const system = await createSystem();
    expect((await upload(system.id, "logo", "logo.png", { content_type: "image/png" })).status).toBe(200);
  });

  test("a renamed file is identified by its bytes, not its name", async () => {
    const system = await createSystem();
    const res    = await upload(system.id, "logo", "logo.jpg", { filename: "logo.png" });
    expect(res.json.data).toMatchObject({ filename: "logo.png", content_type: "image/jpeg" });
  });

  test("unknown or deleted external system → 404", async () => {
    expect((await upload(NIL_UUID, "logo", "logo.png")).status).toBe(404);
    const system = await createSystem();
    await api("DELETE", `/api/external-system/${system.id}`);
    const res = await upload(system.id, "logo", "logo.png");
    expect(res.status).toBe(404);
    expect(res.json._tag).toBe("ExternalSystemNotFound");
  });
});

describe("logos in rendered email", () => {
  test("PNG logo → absolute URL in the header, no warnings", async () => {
    const system   = await createSystem();
    const logo     = (await upload(system.id, "logo", "logo.png")).json.data;
    const template = await createTemplate({ external_system_id: system.id });
    const res      = await api("POST", `/api/notification-template/${template.id}/render`, { payload: { name: "A" } });

    expect(res.json.data.body).toContain(`<img src="https://notify.test/api/asset/${logo.id}"`);
    expect(res.json.data.body).toContain('width="200" height="50"');
    expect(res.json.data.warnings).toEqual([]);
  });

  test("email_header takes priority, and a replacement shows up immediately", async () => {
    const system   = await createSystem();
    await upload(system.id, "logo", "logo.png");
    const header1  = (await upload(system.id, "email_header", "logo.jpg")).json.data;
    const template = await createTemplate({ external_system_id: system.id });
    const render   = () => api("POST", `/api/notification-template/${template.id}/render`, { payload: { name: "A" } });

    expect((await render()).json.data.body).toContain(`/api/asset/${header1.id}"`);
    const header2 = (await upload(system.id, "email_header", "logo.gif")).json.data;
    expect((await render()).json.data.body).toContain(`/api/asset/${header2.id}"`);
  });

  test("SVG-only logo → used with a warning", async () => {
    const system = await createSystem();
    await api("PUT", `/api/external-system/${system.id}/asset/logo`, { filename: "l.svg", data: svgB64(SAFE_SVG) });
    const template = await createTemplate({ external_system_id: system.id });
    const res      = await api("POST", `/api/notification-template/${template.id}/render`, { payload: { name: "A" } });
    expect(res.json.data.warnings[0]).toContain("SVG, which Gmail and Outlook don't display");
  });

  test("after deleting the logo, the header falls back to the name", async () => {
    const system = await createSystem("Fallback Co");
    await upload(system.id, "logo", "logo.png");
    await api("DELETE", `/api/external-system/${system.id}/asset/logo`);
    const template = await createTemplate({ external_system_id: system.id });
    const res      = await api("POST", `/api/notification-template/${template.id}/render`, { payload: { name: "A" } });
    expect(res.json.data.body).not.toContain("<img");
    expect(res.json.data.body).toContain(">Fallback Co</span>");
  });

  test("system.* asset URLs are available to every channel", async () => {
    const system = await createSystem();
    const icon   = (await upload(system.id, "icon", "icon.ico")).json.data;
    const res    = await api("POST", "/api/notification-template/preview", {
      external_system_id: system.id, channel: "telegram", subject: null,
      template: "{{system.name}} {{system.icon_url}}", payload: {},
    });
    expect(res.json.data.body).toBe(`${system.name} https://notify.test/api/asset/${icon.id}`);
  });
});
