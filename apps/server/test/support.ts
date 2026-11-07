import { BunHttpServer } from "@effect/platform-bun";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { SQL } from "bun";
import { AppRoutes } from "../src/app";

// The real application, mounted in-process: same routes, handlers, services
// and Postgres repos as production, minus the listening socket.
const { handler, dispose } = HttpRouter.toWebHandler(
  AppRoutes.pipe(Layer.provide(BunHttpServer.layerHttpServices)),
  { disableLogger: true },
);

// One app instance is shared by every test file in the run (bun test loads
// this module once), so it is torn down once, when the process exits.
process.once("beforeExit", () => void dispose());

export interface ApiResponse<T = any> {
  readonly status:  number;
  readonly headers: Headers;
  readonly json:    T;
  readonly bytes:   Uint8Array;
}

export async function api<T = any>(
  method: string,
  path:   string,
  body?:  unknown,
): Promise<ApiResponse<T>> {
  const response = await handler(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
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

/** Wipe every table between tests. */
export async function resetDb() {
  await sql.unsafe(`
    TRUNCATE provider_usage_log, notification_deliveries, notifications,
             notification_templates, brand_assets, channel_providers,
             user_preferences, user_contacts, external_user_links, users,
             external_systems
    RESTART IDENTITY CASCADE
  `);
}

export { sql as testSql };

// ---------- fixtures ----------

let counter = 0;

export async function createSystem(name = `system-${++counter}`) {
  const res = await api("POST", "/api/external-system", { name, api_key: `key-${name}` });
  if (res.status !== 200) throw new Error(`createSystem failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { id: string; name: string };
}

export async function createUser() {
  const res = await api("POST", "/api/user", {});
  if (res.status !== 200) throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { id: string };
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
