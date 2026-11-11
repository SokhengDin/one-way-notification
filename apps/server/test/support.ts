import { BunHttpServer } from "@effect/platform-bun";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { SQL } from "bun";
import { Effect } from "effect";
import { makeAppRoutes } from "../src/app";
import { SenderRegistry, type OutboundMessage, type SendResult } from "../src/domain/delivery/senders";
import type { ProviderCredentials } from "../src/domain/providers/providers.types";
import { FileStore, makeFileStore } from "../src/storage/file-store";
import { makeFileVaultClient } from "../src/storage/file-vault-client";
import { startFakeFileVault } from "./fake-file-vault";

// ---------- fake provider network ----------
//
// Every message the app "sends" lands here instead of on the network. Tests
// script per-provider behaviour with `fakeSenders.respond(...)`.

export interface SentMessage {
  readonly providerId: string;
  readonly kind:       string;
  readonly message:    OutboundMessage;
}

type Responder = (message: OutboundMessage, credentials: ProviderCredentials) => SendResult;

const ok: Responder = () => ({ ok: true, statusCode: 202, providerRefId: `ref-${crypto.randomUUID()}`, raw: null });

export const fakeSenders = {
  sent:       [] as Array<SentMessage>,
  responders: new Map<string, Responder>(),
  /** Script one provider; unscripted providers accept everything. */
  respond(providerId: string, responder: Responder) {
    this.responders.set(providerId, responder);
  },
  reset() {
    this.sent.length = 0;
    this.responders.clear();
  },
};

export const fail = (error: string, retryable: boolean, statusCode: number | null = retryable ? 503 : 400): Responder =>
  () => ({ ok: false, retryable, statusCode, error, raw: null });

const FakeSendersLive = Layer.succeed(SenderRegistry, {
  send: (credentials, message) =>
    Effect.sync(() => {
      fakeSenders.sent.push({ providerId: credentials.id, kind: credentials.kind, message });
      const responder = fakeSenders.responders.get(credentials.id) ?? ok;
      return { ...responder(message, credentials), durationMs: 1 };
    }),
});

// ---------- fake file storage ----------
//
// A local in-memory file-vault (test/fake-file-vault.ts) reached through the
// real HTTP client, so uploads, version-pinned reads and deletes go over the
// wire exactly as in production. Tests inspect `fakeVault.files` and can make
// it fail with `fakeVault.failWith = 503`.

export const fakeVault = startFakeFileVault();

export const FILE_VAULT_SPACE = "notification-test";

const FakeFileStoreLive = Layer.succeed(
  FileStore,
  makeFileStore(
    makeFileVaultClient({
      baseUrl:   fakeVault.url,
      apiKey:    fakeVault.apiKey,
      spaceName: FILE_VAULT_SPACE,
      timeoutMs: 5_000,
    }),
    // no read cache, so tests see every read reach the vault
    0,
  ),
);

// The real application, mounted in-process: same routes, handlers, services
// and Postgres repos as production, minus the listening socket and with the
// provider network and file storage faked.
const { handler, dispose } = HttpRouter.toWebHandler(
  makeAppRoutes(FakeSendersLive, FakeFileStoreLive).pipe(Layer.provide(BunHttpServer.layerHttpServices)),
  { disableLogger: true },
);

// One app instance is shared by every test file in the run (bun test loads
// this module once), so it is torn down once, when the process exits.
process.once("beforeExit", () => {
  void dispose();
  void fakeVault.stop();
});

export interface ApiResponse<T = any> {
  readonly status:  number;
  readonly headers: Headers;
  readonly json:    T;
  readonly bytes:   Uint8Array;
}

export interface ApiOptions {
  /** bearer token; defaults to the test administrator's session, null sends none */
  readonly token?:   string | null;
  readonly headers?: Record<string, string>;
}

export async function api<T = any>(
  method:   string,
  path:     string,
  body?:    unknown,
  options:  ApiOptions = {},
): Promise<ApiResponse<T>> {
  const token   = options.token === undefined ? await adminToken() : options.token;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await handler(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body:    body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type  = response.headers.get("content-type") ?? "";
  const json  = type.includes("json") && bytes.length > 0 ? JSON.parse(new TextDecoder().decode(bytes)) : null;
  return { status: response.status, headers: response.headers, json, bytes };
}

const sql = new SQL({
  hostname: process.env.DB_HOST ?? "localhost",
  port:     Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME!,
  username: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASS ?? "postgres",
});

// ---------- the test administrator ----------
//
// Every request is signed in as this admin unless a test says otherwise.
// resetDb() leaves admins alone, so the session lives for the whole run.

export const TEST_ADMIN = { email: "admin@test.local", name: "Test Admin", password: "correct horse battery staple" };

let tokenPromise: Promise<string> | null = null;

export function adminToken(): Promise<string> {
  tokenPromise ??= (async () => {
    const [existing] = await sql`SELECT id FROM admins WHERE lower(email) = lower(${TEST_ADMIN.email}) AND deleted_at IS NULL`;
    if (!existing) {
      const hash = await Bun.password.hash(TEST_ADMIN.password);
      await sql`INSERT INTO admins (email, name, password_hash) VALUES (${TEST_ADMIN.email}, ${TEST_ADMIN.name}, ${hash})`;
    }
    const res = await api("POST", "/api/auth/login", { email: TEST_ADMIN.email, password: TEST_ADMIN.password }, { token: null });
    if (res.status !== 200) throw new Error(`test admin login failed: ${res.status} ${JSON.stringify(res.json)}`);
    return res.json.data.token as string;
  })();
  return tokenPromise;
}

/** Wipe every table between tests. */
export async function resetDb() {
  await sql.unsafe(`
    TRUNCATE provider_usage_log, notification_deliveries, notifications,
             notification_templates, brand_assets, channel_providers,
             user_preferences, user_contacts, external_user_links, users,
             external_systems
    RESTART IDENTITY CASCADE
  `);
  fakeVault.reset();
}

export { sql as testSql };

// ---------- fixtures ----------

let counter = 0;

export async function createSystem(name = `system-${++counter}`) {
  const res = await api("POST", "/api/external-system", { name });
  if (res.status !== 200) throw new Error(`createSystem failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { id: string; name: string };
}

/** Issues an API key from the dashboard API; returns the secret and its record. */
export async function issueKey(systemId: string, fields: { name?: string; expires_in_days?: number } = {}) {
  const res = await api("POST", `/api/external-system/${systemId}/api-key`, { name: "Test key", expires_in_days: 30, ...fields });
  if (res.status !== 200) throw new Error(`issueKey failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { secret: string; key: { id: string; status: string; prefix: string; last_four: string } };
}

/** Puts a user under an external system (a system only notifies its own users). */
export async function linkUser(systemId: string, userId: string, externalUserId = `ext-${++counter}`) {
  const res = await api("POST", `/api/external-system/${systemId}/link`, { user_id: userId, external_user_id: externalUserId });
  if (res.status !== 200) throw new Error(`linkUser failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data;
}

export async function createUser(name?: string) {
  const res = await api("POST", "/api/user", name === undefined ? {} : { name });
  if (res.status !== 200) throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { id: string; name: string | null; display_name: string };
}

export async function addContact(userId: string, channel: "email" | "sms" | "telegram", address: string | null, linked = true) {
  const res = await api("POST", `/api/user/${userId}/contacts`, { channel, address, linked, verified: true });
  if (res.status !== 200) throw new Error(`addContact failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data;
}

export async function createProvider(fields: Record<string, unknown> = {}) {
  const res = await api("POST", "/api/channel-provider", {
    channel: "email",
    name:    `provider-${++counter}`,
    kind:    "resend",
    config:  { from_email: "noreply@example.com" },
    secrets: { api_key: "re_test" },
    ...fields,
  });
  if (res.status !== 200) throw new Error(`createProvider failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { id: string; name: string };
}

/** Run the worker once, like the background loop does. */
export async function processQueue() {
  const res = await api("POST", "/api/delivery/process");
  if (res.status !== 200) throw new Error(`processQueue failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { claimed: number; sent: number; retrying: number; failed: number };
}

/** Make every queued delivery due now (skip the backoff wait). */
export async function makeAllDue() {
  await sql`UPDATE notification_deliveries SET next_attempt_at = now() - interval '1 second' WHERE status IN ('pending', 'retrying')`;
}

export async function createTemplate(fields: {
  external_system_id: string;
  event_type?:        string;
  channel?:           "email" | "sms" | "telegram";
  template?:          string;
  subject?:           string | null;
}) {
  const res = await api("POST", "/api/notification-template", {
    event_type: "order.shipped",
    channel:    "email",
    template:   "<p>Hello {{name}}</p>",
    subject:    "Hi {{name}}",
    ...fields,
  });
  if (res.status !== 200) throw new Error(`createTemplate failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { id: string; channel: string; subject: string | null; template: string };
}
