// Load test for the delivery pipeline: how fast notifications are accepted,
// how fast parallel workers drain the queue, and whether anything is lost or
// sent twice under concurrency.
//
//   bun run bench                          (from the repo root)
//   BENCH_NOTIFICATIONS=5000 BENCH_WORKERS=4 BENCH_LATENCY_MS=150 bun run bench
//
// Runs the real app in-process (same routes, services and Postgres) against a
// throwaway database it rebuilds from the migrations, with a fake provider
// that takes BENCH_LATENCY_MS per message and fails BENCH_FAIL_RATE of them.

import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { join } from "node:path";
import { SQL } from "bun";

const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

const DB_NAME       = process.env.BENCH_DB_NAME ?? "notification_bench";
const NOTIFICATIONS = env("BENCH_NOTIFICATIONS", 2000);
const INGEST_PAR    = env("BENCH_INGEST_PARALLEL", 50);
const WORKERS       = env("BENCH_WORKERS", 4);
const LATENCY_MS    = env("BENCH_LATENCY_MS", 100);
const FAIL_RATE     = env("BENCH_FAIL_RATE", 0.05);

if (!/bench|test/i.test(DB_NAME)) {
  console.error(`Refusing to use "${DB_NAME}": the bench wipes its database, so the name must contain "bench" or "test".`);
  process.exit(1);
}

process.env.DB_NAME             = DB_NAME;
process.env.PROVIDER_SECRET_KEY = "bench-only-provider-secret-key";
process.env.PUBLIC_URL          = "https://notify.bench";

// ---------- fresh database ----------

const connection = {
  hostname: process.env.DB_HOST ?? "localhost",
  port:     Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASS ?? "postgres",
};

const admin = new SQL({ ...connection, database: "postgres" });
if ((await admin`SELECT 1 FROM pg_database WHERE datname = ${DB_NAME}`).length === 0) {
  await admin.unsafe(`CREATE DATABASE "${DB_NAME.replace(/"/g, '""')}"`);
}
await admin.close();

const sql = new SQL({ ...connection, database: DB_NAME });
await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
const migrations = join(import.meta.dir, "..", "db", "migrations");
for (const file of [...new Bun.Glob("*.sql").scanSync(migrations)].sort()) {
  await sql.unsafe(await Bun.file(join(migrations, file)).text());
}

// ---------- the app, with a slow, flaky fake provider ----------

const { makeAppRoutes }   = await import("../src/app");
const { SenderRegistry }  = await import("../src/domain/delivery/senders");

const sendsPerDelivery = new Map<string, number>();
let accepted = 0;
let inFlight = 0;
let peakInFlight = 0;

const FakeProvider = Layer.succeed(SenderRegistry, {
  send: (_credentials, message) =>
    Effect.promise(async () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await Bun.sleep(LATENCY_MS * (0.5 + Math.random()));
      inFlight--;
      if (Math.random() < FAIL_RATE) {
        return { ok: false as const, retryable: true, statusCode: 503, error: "bench: simulated outage", raw: null, durationMs: LATENCY_MS };
      }
      accepted++;
      sendsPerDelivery.set(message.idempotencyKey, (sendsPerDelivery.get(message.idempotencyKey) ?? 0) + 1);
      return { ok: true as const, statusCode: 202, providerRefId: crypto.randomUUID(), raw: null, durationMs: LATENCY_MS };
    }),
});

const { handler, dispose } = HttpRouter.toWebHandler(
  makeAppRoutes(FakeProvider).pipe(Layer.provide(BunHttpServer.layerHttpServices)),
  { disableLogger: true },
);

let token = "";
async function api(method: string, path: string, body?: unknown) {
  const res = await handler(new Request(`http://bench${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body:    body === undefined ? undefined : JSON.stringify(body),
  }));
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

// ---------- fixtures ----------

const hash = await Bun.password.hash("bench-admin-password");
await sql`INSERT INTO admins (email, name, password_hash) VALUES ('bench@local', 'Bench', ${hash})`;
token = (await api("POST", "/api/auth/login", { email: "bench@local", password: "bench-admin-password" })).json.data.token;

const system = (await api("POST", "/api/external-system", { name: "Bench" })).json.data;
await api("POST", "/api/notification-template", {
  external_system_id: system.id, event_type: "bench.event", channel: "email",
  subject: "Hello {{name}}", template: "<p>Order {{order}}</p>",
});
await api("POST", "/api/notification-template", {
  external_system_id: system.id, event_type: "bench.event", channel: "sms", subject: null, template: "Order {{order}}",
});
// two email providers so failover is exercised too
for (const [name, priority] of [["Primary", 10], ["Backup", 20]] as const) {
  await api("POST", "/api/channel-provider", { channel: "email", name, kind: "resend", priority, config: { from_email: "bench@bench.test" }, secrets: { api_key: "re_x" } });
}
await api("POST", "/api/channel-provider", {
  channel: "sms", name: "SMS", kind: "twilio", config: { account_sid: "AC1", from_number: "+33600000000" }, secrets: { auth_token: "t" },
});

const USERS = 200;
const userIds: Array<string> = [];
for (let i = 0; i < USERS; i++) {
  const user = (await api("POST", "/api/user", { name: `Bench ${i}` })).json.data;
  await api("POST", `/api/user/${user.id}/contacts`, { channel: "email", address: `u${i}@bench.test`, linked: true, verified: true });
  if (i % 2 === 0) await api("POST", `/api/user/${user.id}/contacts`, { channel: "sms", address: `+3360000${String(1000 + i)}`, linked: true, verified: true });
  await api("POST", `/api/external-system/${system.id}/link`, { user_id: user.id, external_user_id: `bench-${i}` });
  userIds.push(user.id);
}

// ---------- 1. ingest ----------

console.log(`\nIngest: ${NOTIFICATIONS} notifications, ${INGEST_PAR} requests at a time`);
let next = 0;
let errors = 0;
const ingestStart = performance.now();
await Promise.all(Array.from({ length: INGEST_PAR }, async () => {
  while (next < NOTIFICATIONS) {
    const i = next++;
    const res = await api("POST", "/api/notification", {
      external_system_id: system.id, user_id: userIds[i % USERS], event_type: "bench.event",
      payload: { name: `Bench ${i}`, order: `B-${i}` }, idempotency_key: `bench-${i}`,
    });
    if (res.status !== 200) errors++;
  }
}));
const ingestS = (performance.now() - ingestStart) / 1000;
const [{ total: planned }] = await sql`SELECT count(*)::int AS total FROM notification_deliveries WHERE status = 'pending'`;
console.log(`  ${(NOTIFICATIONS / ingestS).toFixed(0)} notifications/s · ${planned} deliveries planned · ${errors} errors`);

// ---------- 2. deliver with parallel workers ----------

// retries would wait 30 s+; make every retry due at once so the run finishes
const hurryRetries = () => sql`UPDATE notification_deliveries SET next_attempt_at = now() WHERE status = 'retrying'`;

console.log(`\nDeliver: ${WORKERS} workers in parallel, provider latency ~${LATENCY_MS} ms, ${(FAIL_RATE * 100).toFixed(0)} % transient failures`);
const deliverStart = performance.now();
let rounds = 0;
while (true) {
  const results = await Promise.all(Array.from({ length: WORKERS }, () => api("POST", "/api/delivery/process")));
  rounds++;
  const claimed = results.reduce((sum, res) => sum + (res.json?.data?.claimed ?? 0), 0);
  if (claimed === 0) {
    await hurryRetries();
    const [{ left }] = await sql`SELECT count(*)::int AS left FROM notification_deliveries WHERE status IN ('pending', 'retrying')`;
    if (left === 0) break;
  }
}
const deliverS = (performance.now() - deliverStart) / 1000;

const statuses = await sql`SELECT status::text, count(*)::int AS n FROM notification_deliveries GROUP BY 1 ORDER BY 1`;
const dupes    = [...sendsPerDelivery.values()].filter((count) => count > 1).length;
const [{ sent }] = await sql`SELECT count(*)::int AS sent FROM notification_deliveries WHERE status = 'sent'`;

console.log(`  ${(sent / deliverS).toFixed(0)} deliveries/s · ${deliverS.toFixed(1)} s · ${rounds} rounds · peak ${peakInFlight} provider calls at once`);
console.log(`  statuses: ${statuses.map((row: { status: string; n: number }) => `${row.status} ${row.n}`).join(", ")}`);
console.log(`  sent twice: ${dupes} · provider accepted ${accepted} for ${sent} sent deliveries`);

const ok = errors === 0 && dupes === 0 && accepted === sent;
console.log(ok ? "\n✓ nothing lost, nothing sent twice" : "\n✗ inconsistency found");

await dispose();
await sql.close();
process.exit(ok ? 0 : 1);
