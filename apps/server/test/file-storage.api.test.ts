// Brand assets kept in file-vault: what goes over the wire, what stays in
// Postgres, and what happens when file storage misbehaves.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { FileStore } from "../src/storage/file-store";
import { FileVaultError, makeFileVaultClient } from "../src/storage/file-vault-client";
import { startFakeFileVault } from "./fake-file-vault";
import { api, createSystem, FILE_VAULT_SPACE, fakeVault, resetDb, testSql } from "./support";

beforeEach(resetDb);
afterEach(() => {
  fakeVault.failWith = null;
});

const fixture = async (name: string) =>
  new Uint8Array(await Bun.file(join(import.meta.dir, "fixtures", name)).arrayBuffer());

async function upload(systemId: string, kind: string, file = "logo.png") {
  return api("PUT", `/api/external-system/${systemId}/asset/${kind}`, {
    filename: file,
    data:     Buffer.from(await fixture(file)).toString("base64"),
  });
}

const row = async (id: string) =>
  (await testSql`
    SELECT data, storage_file_id, storage_version_id, deleted_at, replaced_at
    FROM brand_assets WHERE id = ${id}
  `)[0];

describe("uploads go to file-vault", () => {
  test("bytes live in file-vault under brand-assets/<system>/<kind>/<id>.<ext>, not in Postgres", async () => {
    const system = await createSystem();
    const bytes  = await fixture("logo.png");
    const res    = await upload(system.id, "logo");
    expect(res.json.status).toBe(201);
    const asset = res.json.data;

    const stored = fakeVault.fileByKey(`brand-assets/${system.id}/logo/${asset.id}.png`);
    expect(stored).toBeDefined();
    expect(stored!.versions).toHaveLength(1);
    expect(stored!.versions[0]!.bytes).toEqual(bytes);
    expect(stored!.versions[0]!.mimeType).toBe("image/png");

    const db = await row(asset.id);
    expect(db.data).toBeNull();
    expect(db.storage_file_id).toBe(stored!.id);
    expect(db.storage_version_id).toBe(stored!.versions[0]!.id);
  });

  test("served by reading that exact version back", async () => {
    const system = await createSystem();
    const asset  = (await upload(system.id, "logo", "logo.jpg")).json.data;
    fakeVault.requests.length = 0;

    const file = await api("GET", asset.url);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(file.bytes).toEqual(await fixture("logo.jpg"));

    const db = await row(asset.id);
    expect(fakeVault.requests).toEqual([
      { method: "GET", path: `/v1/files/${db.storage_file_id}/versions/${db.storage_version_id}/content` },
    ]);
  });

  test("the space is found or created once by name, then reused", async () => {
    const system = await createSystem();
    await upload(system.id, "logo");
    await upload(system.id, "icon", "icon.ico");
    await upload(system.id, "logo_dark", "logo.gif");

    expect([...fakeVault.spaces.values()].map((space) => space.name)).toEqual([FILE_VAULT_SPACE]);
    expect(fakeVault.requests.filter((r) => r.path === "/v1/spaces" && r.method === "POST")).toHaveLength(0);
    expect([...fakeVault.files.values()].every((f) => f.spaceId === [...fakeVault.spaces.keys()][0])).toBe(true);
  });

  test("replacing uploads a new file and keeps the old one (sent emails still show it)", async () => {
    const system = await createSystem();
    const first  = (await upload(system.id, "logo", "logo.png")).json.data;
    const second = (await upload(system.id, "logo", "logo.jpg")).json.data;

    const [a, b] = [await row(first.id), await row(second.id)];
    expect(a.storage_file_id).not.toBe(b.storage_file_id);
    expect(fakeVault.files.get(a.storage_file_id)!.deletedAt).toBeNull();

    expect((await api("GET", first.url)).bytes).toEqual(await fixture("logo.png"));
    expect((await api("GET", second.url)).bytes).toEqual(await fixture("logo.jpg"));
  });
});

describe("delete", () => {
  test("moves the current file to file-vault's trash; replaced ones stay", async () => {
    const system  = await createSystem();
    const old     = (await upload(system.id, "logo", "logo.png")).json.data;
    const current = (await upload(system.id, "logo", "logo.jpg")).json.data;

    expect((await api("DELETE", `/api/external-system/${system.id}/asset/logo`)).status).toBe(204);

    const [o, c] = [await row(old.id), await row(current.id)];
    expect(fakeVault.files.get(c.storage_file_id)!.deletedAt).not.toBeNull();
    expect(fakeVault.files.get(o.storage_file_id)!.deletedAt).toBeNull();
    expect((await api("GET", current.url)).status).toBe(404);
    expect((await api("GET", old.url)).status).toBe(200);
  });

  test("still succeeds when file storage is down (the row decides)", async () => {
    const system = await createSystem();
    const asset  = (await upload(system.id, "logo")).json.data;

    fakeVault.failWith = 503;
    expect((await api("DELETE", `/api/external-system/${system.id}/asset/logo`)).status).toBe(204);
    expect((await row(asset.id)).deleted_at).not.toBeNull();
  });
});

describe("when file storage fails", () => {
  test("upload → 503 and nothing is written", async () => {
    const system  = await createSystem();
    const current = (await upload(system.id, "logo")).json.data;

    fakeVault.failWith = 503;
    const res = await upload(system.id, "logo", "logo.jpg");
    expect(res.status).toBe(503);
    expect(res.json._tag).toBe("FileStorageUnavailable");
    // internal addresses stay in the server log
    expect(JSON.stringify(res.json)).not.toContain(fakeVault.url);

    fakeVault.failWith = null;
    const list = await api("GET", `/api/external-system/${system.id}/asset`);
    expect(list.json.data.map((a: { id: string }) => a.id)).toEqual([current.id]);
    expect((await testSql`SELECT count(*)::int AS n FROM brand_assets`)[0].n).toBe(1);
  });

  test("an API key file-vault rejects → 503, not 500", async () => {
    const system = await createSystem();
    fakeVault.failWith = 401;
    expect((await upload(system.id, "logo")).status).toBe(503);
  });

  test("serving → 503 while it is down, then works again", async () => {
    const system = await createSystem();
    const asset  = (await upload(system.id, "logo")).json.data;

    fakeVault.failWith = 503;
    expect((await api("GET", asset.url)).status).toBe(503);

    fakeVault.failWith = null;
    expect((await api("GET", asset.url)).status).toBe(200);
  });

  test("a file file-vault no longer has → 404", async () => {
    const system = await createSystem();
    const asset  = (await upload(system.id, "logo")).json.data;
    fakeVault.files.delete((await row(asset.id)).storage_file_id);

    expect((await api("GET", asset.url)).status).toBe(404);
  });

  test("unknown system → 404, and the file just uploaded is cleaned up", async () => {
    const res = await upload("00000000-0000-4000-8000-000000000000", "logo");
    expect(res.status).toBe(404);
    expect([...fakeVault.files.values()].every((f) => f.deletedAt !== null)).toBe(true);
  });
});

describe("assets stored before file-vault (migration 007)", () => {
  async function insertLegacy(systemId: string) {
    const bytes = await fixture("logo.png");
    const [legacy] = await testSql`
      INSERT INTO brand_assets (external_system_id, kind, filename, content_type, byte_size, width, height, sha256, data)
      VALUES (${systemId}, 'logo', 'legacy.png', 'image/png', ${bytes.byteLength}, 480, 120,
              ${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}, ${Buffer.from(bytes)})
      RETURNING id
    `;
    return { id: legacy.id as string, bytes };
  }

  test("are still served from Postgres without touching file-vault", async () => {
    const system = await createSystem();
    const legacy = await insertLegacy(system.id);

    fakeVault.failWith = 503;
    const file = await api("GET", `/api/asset/${legacy.id}`);
    expect(file.status).toBe(200);
    expect(file.bytes).toEqual(legacy.bytes);
  });

  test("can be replaced (new one goes to file-vault) and deleted", async () => {
    const system = await createSystem();
    const legacy = await insertLegacy(system.id);

    const next = (await upload(system.id, "logo", "logo.jpg")).json.data;
    expect((await row(legacy.id)).replaced_at).not.toBeNull();
    expect((await row(next.id)).storage_file_id).not.toBeNull();
    expect((await api("GET", `/api/asset/${legacy.id}`)).status).toBe(200);

    expect((await api("DELETE", `/api/external-system/${system.id}/asset/logo`)).status).toBe(204);
  });

  test("a row must hold its bytes in exactly one place", async () => {
    const system = await createSystem();
    await expect(
      testSql`
        INSERT INTO brand_assets (external_system_id, kind, filename, content_type, byte_size, sha256)
        VALUES (${system.id}, 'logo', 'x.png', 'image/png', 10, 'abc')
      `,
    ).rejects.toThrow(/chk_brand_assets_one_location/);
  });
});

describe("file-vault client", () => {
  test("a configured FILE_VAULT_SPACE_ID is used as is", async () => {
    const vault  = startFakeFileVault();
    const fixed  = { id: crypto.randomUUID(), name: "pre-made" };
    vault.spaces.set(fixed.id, fixed);
    const client = makeFileVaultClient({ baseUrl: vault.url, apiKey: vault.apiKey, spaceId: fixed.id, spaceName: "ignored", timeoutMs: 2_000 });

    const stored = await client.put({ key: "a/b.png", contentType: "image/png", bytes: new Uint8Array([1, 2, 3]) });
    expect(vault.files.get(stored.fileId)!.spaceId).toBe(fixed.id);
    expect(vault.requests.some((r) => r.path === "/v1/spaces")).toBe(false);
    await vault.stop();
  });

  test("creates the space when it doesn't exist yet", async () => {
    const vault  = startFakeFileVault();
    const client = makeFileVaultClient({ baseUrl: vault.url, apiKey: vault.apiKey, spaceName: "fresh", timeoutMs: 2_000 });

    const id = await client.spaceId();
    expect(vault.spaces.get(id)?.name).toBe("fresh");
    expect(await client.spaceId()).toBe(id);
    expect(vault.requests.filter((r) => r.path === "/v1/spaces")).toHaveLength(2); // one GET, one POST
    await vault.stop();
  });

  test("a failed space lookup is retried on the next call", async () => {
    const vault  = startFakeFileVault();
    const client = makeFileVaultClient({ baseUrl: vault.url, apiKey: vault.apiKey, spaceName: "s", timeoutMs: 2_000 });

    vault.failWith = 502;
    await expect(client.spaceId()).rejects.toThrow(FileVaultError);
    vault.failWith = null;
    expect(await client.spaceId()).toBeString();
    await vault.stop();
  });

  test("wrong key → error naming the status; bytes round-trip; remove is idempotent", async () => {
    const vault = startFakeFileVault();
    const bad   = makeFileVaultClient({ baseUrl: vault.url, apiKey: "fv_wrong", spaceName: "s", timeoutMs: 2_000 });
    await expect(bad.spaceId()).rejects.toThrow(/401/);

    const client = makeFileVaultClient({ baseUrl: `${vault.url}/`, apiKey: vault.apiKey, spaceName: "s", timeoutMs: 2_000 });
    const stored = await client.put({ key: "k.bin", contentType: "application/octet-stream", bytes: new Uint8Array([9, 8, 7]) });
    expect(stored.byteSize).toBe(3);
    expect(await client.get(stored.fileId, stored.versionId)).toEqual(new Uint8Array([9, 8, 7]));
    expect(await client.get(stored.fileId, crypto.randomUUID())).toBeNull();

    await client.remove(stored.fileId);
    await client.remove(stored.fileId);
    expect(await client.get(stored.fileId, stored.versionId)).toBeNull();
    await vault.stop();
  });

  test("an unreachable vault fails with a FileVaultError", async () => {
    const client = makeFileVaultClient({ baseUrl: "http://127.0.0.1:1", apiKey: "k", spaceName: "s", timeoutMs: 1_000 });
    await expect(client.spaceId()).rejects.toThrow(FileVaultError);
  });
});

describe("without FILE_VAULT_URL / FILE_VAULT_API_KEY", () => {
  test("the store answers FileStorageUnavailable instead of failing to boot", async () => {
    const result = await Effect.gen(function* () {
      const files = yield* FileStore;
      return yield* files.put({ key: "x", contentType: "image/png", bytes: new Uint8Array([1]) }).pipe(Effect.flip);
    }).pipe(Effect.provide(FileStore.fileVault), Effect.provide(Layer.empty), Effect.runPromise);

    expect(result._tag).toBe("FileStorageUnavailable");
    expect(result.message).toContain("FILE_VAULT_URL");
  });
});
