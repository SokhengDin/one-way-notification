// HTTP client for file-vault (SokhengDin/one-way-file-service), the file
// storage service this API keeps its files in.
//
// Plain async functions, no Effect: the `FileStore` service wraps them for
// the app, and one-off scripts (db/move-assets-to-file-vault.ts) call them
// directly.
//
// file-vault contract used here (every JSON reply is the envelope
// `{ status, message, data }`; file content is a raw stream):
//
//   GET    /v1/spaces                                  find our space by name
//   POST   /v1/spaces                 { name }         create it on first use
//   POST   /v1/spaces/<space>/files?key=…  raw body    upload → { file, version }
//   GET    /v1/files/<id>/versions/<version>/content    bytes of one version
//   DELETE /v1/files/<id>                              move to trash
//
// The API key needs scopes files:read, files:write, files:delete, plus
// spaces:manage when FILE_VAULT_SPACE_ID is not set (to create the space).

export interface FileVaultOptions {
  /** e.g. http://file-vault:8080 (no trailing slash needed) */
  readonly baseUrl:   string;
  /** `fv_<prefix>_<secret>` */
  readonly apiKey:    string;
  /** use this space; when absent, the space named `spaceName` is found or created */
  readonly spaceId?:  string;
  readonly spaceName: string;
  readonly timeoutMs: number;
  /** replaceable in tests */
  readonly fetch?:    typeof fetch;
}

export interface StoredFile {
  readonly fileId:    string;
  /** the exact version written: reading it back by version is immutable */
  readonly versionId: string;
  readonly byteSize:  number;
  /** SHA-256 hex computed by file-vault, null on very old vault versions */
  readonly sha256:    string | null;
}

export class FileVaultError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "FileVaultError";
  }
}

interface Envelope<T> {
  readonly status:  number;
  readonly message: string;
  readonly data:    T | null;
}

interface SpaceRow {
  readonly id:   string;
  readonly name: string;
}

interface UploadRow {
  readonly file:    { readonly id: string };
  readonly version: { readonly id: string; readonly size_bytes: number; readonly sha256: string | null };
}

export interface FileVaultClient {
  /** Resolve (and remember) the space files go into. */
  readonly spaceId:  () => Promise<string>;
  readonly put:      (input: { key: string; contentType: string; bytes: Uint8Array }) => Promise<StoredFile>;
  /** Bytes of one version; null when the file or version no longer exists. */
  readonly get:      (fileId: string, versionId: string) => Promise<Uint8Array | null>;
  /** Move to file-vault's trash. A file that is already gone is not an error. */
  readonly remove:   (fileId: string) => Promise<void>;
}

export function makeFileVaultClient(options: FileVaultOptions): FileVaultClient {
  const baseUrl  = options.baseUrl.replace(/\/+$/, "");
  const doFetch  = options.fetch ?? fetch;

  async function request(method: string, path: string, init: { body?: Uint8Array | string; headers?: Record<string, string> } = {}) {
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method,
        body:    init.body,
        headers: { authorization: `Bearer ${options.apiKey}`, ...init.headers },
        signal:  AbortSignal.timeout(options.timeoutMs),
      });
    } catch (cause) {
      const reason = cause instanceof Error && cause.name === "TimeoutError"
        ? `timed out after ${options.timeoutMs} ms`
        : cause instanceof Error ? cause.message : String(cause);
      throw new FileVaultError(`file-vault ${method} ${path} failed: ${reason}`);
    }
  }

  async function json<T>(method: string, path: string, init: { body?: Uint8Array | string; headers?: Record<string, string> } = {}): Promise<T> {
    const response = await request(method, path, init);
    let envelope: Envelope<T> | null = null;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      // not JSON: a proxy error page, for instance
    }
    if (!response.ok || envelope === null || envelope.data === null) {
      const message = envelope?.message ?? response.statusText;
      throw new FileVaultError(`file-vault ${method} ${path} → ${response.status} ${message}`, response.status);
    }
    return envelope.data;
  }

  // Resolved once. A failure is not remembered, so the next call retries.
  let space: Promise<string> | null = options.spaceId ? Promise.resolve(options.spaceId) : null;

  const spaceId = () => {
    space ??= (async () => {
      const spaces   = await json<ReadonlyArray<SpaceRow>>("GET", "/v1/spaces");
      const existing = spaces.find((row) => row.name === options.spaceName);
      if (existing) return existing.id;

      const created = await json<SpaceRow>("POST", "/v1/spaces", {
        body:    JSON.stringify({ name: options.spaceName }),
        headers: { "content-type": "application/json" },
      });
      return created.id;
    })().catch((error) => {
      space = null;
      throw error;
    });
    return space;
  };

  const put: FileVaultClient["put"] = async ({ key, contentType, bytes }) => {
    const space = await spaceId();
    const row   = await json<UploadRow>("POST", `/v1/spaces/${space}/files?key=${encodeURIComponent(key)}`, {
      body:    bytes,
      headers: { "content-type": contentType, "content-length": String(bytes.byteLength) },
    });
    return {
      fileId:    row.file.id,
      versionId: row.version.id,
      byteSize:  row.version.size_bytes,
      sha256:    row.version.sha256 ?? null,
    };
  };

  const get: FileVaultClient["get"] = async (fileId, versionId) => {
    const path     = `/v1/files/${fileId}/versions/${versionId}/content`;
    const response = await request("GET", path);
    // file-vault answers 404 for "missing" and for "not yours" alike
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new FileVaultError(`file-vault GET ${path} → ${response.status}`, response.status);
    }
    return new Uint8Array(await response.arrayBuffer());
  };

  const remove: FileVaultClient["remove"] = async (fileId) => {
    const path     = `/v1/files/${fileId}`;
    const response = await request("DELETE", path);
    await response.body?.cancel();
    if (response.ok || response.status === 404) return;
    throw new FileVaultError(`file-vault DELETE ${path} → ${response.status}`, response.status);
  };

  return { spaceId, put, get, remove };
}
