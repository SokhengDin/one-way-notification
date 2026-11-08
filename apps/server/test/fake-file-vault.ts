// An in-memory stand-in for file-vault (SokhengDin/one-way-file-service),
// implementing just the part of its API this service uses, with the same
// envelope, status codes and auth rules.
//
// Used by the API tests (through the real HTTP client) and by the dashboard
// e2e run. Standalone:
//
//   FAKE_FILE_VAULT_PORT=3301 FAKE_FILE_VAULT_KEY=fv_test_key bun test/fake-file-vault.ts

export interface FakeVaultFile {
  readonly id:       string;
  readonly spaceId:  string;
  readonly key:      string;
  versions:          Array<{ id: string; bytes: Uint8Array; mimeType: string; sha256: string }>;
  deletedAt:         Date | null;
}

export interface FakeVaultRequest {
  readonly method: string;
  readonly path:   string;
}

export interface FakeFileVault {
  readonly url:      string;
  readonly apiKey:   string;
  readonly spaces:   Map<string, { id: string; name: string }>;
  readonly files:    Map<string, FakeVaultFile>;
  readonly requests: Array<FakeVaultRequest>;
  /** Answer every request with this status until cleared (null). */
  failWith:          number | null;
  /** Live file stored under a key, if any. */
  fileByKey(key: string): FakeVaultFile | undefined;
  reset(): void;
  stop(): Promise<void>;
}

const envelope = (status: number, message: string, data: unknown = null) =>
  Response.json({ status, message, data }, { status });

const sha256Hex = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

const UUID = "[0-9a-f-]{36}";

export function startFakeFileVault(options: { port?: number; apiKey?: string } = {}): FakeFileVault {
  const apiKey   = options.apiKey ?? `fv_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const spaces   = new Map<string, { id: string; name: string }>();
  const files    = new Map<string, FakeVaultFile>();
  const requests: Array<FakeVaultRequest> = [];

  const fileMeta = (file: FakeVaultFile) => {
    const current = file.versions.at(-1)!;
    return {
      id:                 file.id,
      space_id:           file.spaceId,
      key:                file.key,
      current_version_id: current.id,
      size_bytes:         current.bytes.byteLength,
      mime_type:          current.mimeType,
      deleted_at:         file.deletedAt?.toISOString() ?? null,
    };
  };

  async function handle(request: Request): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;
    requests.push({ method: request.method, path: `${path}${url.search}` });

    if (vault.failWith !== null) return envelope(vault.failWith, "injected failure");

    const auth = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? request.headers.get("x-api-key");
    if (auth !== apiKey) return envelope(401, "unauthorized");

    let match: RegExpMatchArray | null;

    if (path === "/v1/spaces" && request.method === "GET") {
      return envelope(200, "OK", [...spaces.values()]);
    }

    if (path === "/v1/spaces" && request.method === "POST") {
      const body = (await request.json()) as { name?: string };
      if (!body.name) return envelope(400, "name is required");
      const space = { id: crypto.randomUUID(), name: body.name };
      spaces.set(space.id, space);
      return envelope(201, "Created", space);
    }

    if ((match = path.match(new RegExp(`^/v1/spaces/(${UUID})/files$`))) && request.method === "POST") {
      const space = spaces.get(match[1]!);
      if (!space) return envelope(404, "space not found");
      const key = url.searchParams.get("key");
      if (!key) return envelope(400, "key is required");

      const bytes   = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength === 0) return envelope(400, "empty upload");
      const version = {
        id:       crypto.randomUUID(),
        bytes,
        mimeType: request.headers.get("content-type") ?? "application/octet-stream",
        sha256:   sha256Hex(bytes),
      };

      let file = [...files.values()].find((f) => f.spaceId === space.id && f.key === key && f.deletedAt === null);
      if (file) {
        file.versions.push(version);
      } else {
        file = { id: crypto.randomUUID(), spaceId: space.id, key, versions: [version], deletedAt: null };
        files.set(file.id, file);
      }

      return envelope(201, file.versions.length === 1 ? "Created" : "New version created", {
        file:    fileMeta(file),
        version: {
          id:           version.id,
          file_id:      file.id,
          version_no:   file.versions.length,
          size_bytes:   bytes.byteLength,
          sha256:       version.sha256,
          mime_type:    version.mimeType,
        },
        chunks:      1,
        new_chunks:  1,
        dedup_ratio: 0,
      });
    }

    if ((match = path.match(new RegExp(`^/v1/files/(${UUID})/versions/(${UUID})/content$`))) && request.method === "GET") {
      const file    = files.get(match[1]!);
      const version = file?.deletedAt === null ? file.versions.find((v) => v.id === match![2]) : undefined;
      if (!version) return envelope(404, "file not found");
      return new Response(version.bytes, {
        headers: { "content-type": version.mimeType, "x-content-sha256": version.sha256 },
      });
    }

    if ((match = path.match(new RegExp(`^/v1/files/(${UUID})$`))) && request.method === "DELETE") {
      const file = files.get(match[1]!);
      if (!file || file.deletedAt !== null) return envelope(404, "file not found");
      file.deletedAt = new Date();
      return envelope(200, "Moved to trash", { id: file.id, deleted_at: file.deletedAt.toISOString() });
    }

    return envelope(404, "not found");
  }

  const server = Bun.serve({ port: options.port ?? 0, hostname: "127.0.0.1", fetch: handle });

  const vault: FakeFileVault = {
    url:      `http://127.0.0.1:${server.port}`,
    apiKey,
    spaces,
    files,
    requests,
    failWith: null,
    fileByKey: (key) => [...files.values()].find((f) => f.key === key && f.deletedAt === null),
    reset() {
      files.clear();
      requests.length = 0;
      vault.failWith = null;
    },
    stop: () => server.stop(true),
  };
  return vault;
}

if (import.meta.main) {
  const vault = startFakeFileVault({
    port:   Number(process.env.FAKE_FILE_VAULT_PORT ?? 3301),
    apiKey: process.env.FAKE_FILE_VAULT_KEY ?? "fv_fake_local_key",
  });
  console.log(`fake file-vault on ${vault.url}`);
}
