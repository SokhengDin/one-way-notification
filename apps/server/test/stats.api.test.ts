import { beforeEach, describe, expect, test } from "bun:test";
import { api, resetDb, testSql } from "./support";

beforeEach(resetDb);

// ---------- fixtures (direct SQL: deliveries have no create endpoint) ----------

async function system(name: string) {
  const [row] = await testSql`INSERT INTO external_systems (name) VALUES (${name}) RETURNING id`;
  return row.id as string;
}

async function user() {
  const [row] = await testSql`INSERT INTO users DEFAULT VALUES RETURNING id`;
  return row.id as string;
}

async function provider(name: string, channel = "email", kind = "smtp", active = true) {
  const [row] = await testSql`
    INSERT INTO channel_providers (name, channel, kind, is_active) VALUES (${name}, ${channel}::channel_type, ${kind}, ${active})
    RETURNING id`;
  return row.id as string;
}

/** `at` is a SQL expression for created_at, e.g. "now() - interval '2 days'". */
async function notification(systemId: string, userId: string, eventType: string, at = "now()") {
  const [row] = await testSql.unsafe(
    `INSERT INTO notifications (external_system_id, user_id, event_type, payload, created_at)
     VALUES ($1, $2, $3, '{}'::jsonb, ${at}) RETURNING id`,
    [systemId, userId, eventType],
  );
  return row.id as string;
}

async function delivery(
  notificationId: string,
  options: { channel?: string; status?: string; providerId?: string | null; attempts?: number; error?: string; at?: string } = {},
) {
  const at = options.at ?? "now()";
  const [row] = await testSql.unsafe(
    `INSERT INTO notification_deliveries (notification_id, channel, provider_id, status, attempt_count, last_error, created_at, updated_at)
     VALUES ($1, $2::channel_type, $3, $4::delivery_status, $5, $6, ${at}, ${at})
     RETURNING id`,
    [notificationId, options.channel ?? "email", options.providerId ?? null, options.status ?? "sent", options.attempts ?? 1, options.error ?? null],
  );
  return row.id as string;
}

async function usage(deliveryId: string, providerId: string, cost: string, at = "now()") {
  await testSql.unsafe(
    `INSERT INTO provider_usage_log (delivery_id, provider_id, cost, attempted_at) VALUES ($1, $2, $3, ${at})`,
    [deliveryId, providerId, cost],
  );
}

const overview = async (query = "") => {
  const res = await api("GET", `/api/stats/overview${query}`);
  if (res.status !== 200) throw new Error(`overview failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data;
};

// ---------- tests ----------

describe("empty database", () => {
  test("everything is zero, every day and channel is present", async () => {
    const data = await overview("?days=7");
    expect(data.range).toMatchObject({ days: 7, timezone: "UTC" });
    expect(data.totals).toEqual({
      notifications: 0, deliveries: 0, sent: 0, failed: 0, pending: 0, retrying: 0, skipped: 0,
      success_rate: null, avg_attempts: null, cost: "0",
    });
    expect(data.daily).toHaveLength(7);
    expect(data.daily.every((d: Record<string, number>) => d.sent === 0 && d.notifications === 0)).toBe(true);
    expect(data.channels.map((c: { channel: string }) => c.channel)).toEqual(["email", "sms", "telegram"]);
    expect(data.providers).toEqual([]);
    expect(data.recent_failures).toEqual([]);
  });

  test("defaults to 30 days", async () => {
    expect((await overview()).daily).toHaveLength(30);
  });
});

describe("totals", () => {
  test("counts by status, success rate, attempts and cost", async () => {
    const s = await system("shop");
    const u = await user();
    const p = await provider("ses");

    const statuses = ["sent", "sent", "sent", "failed", "pending", "retrying", "skipped"];
    for (const [i, status] of statuses.entries()) {
      const n = await notification(s, u, "order.confirmed");
      const d = await delivery(n, { status, providerId: p, attempts: status === "failed" ? 3 : 1 });
      if (status === "sent" || status === "failed") await usage(d, p, i === 0 ? "0.0100" : "0.0005");
    }

    const { totals } = await overview("?days=7");
    expect(totals).toMatchObject({
      notifications: 7, deliveries: 7, sent: 3, failed: 1, pending: 1, retrying: 1, skipped: 1,
      success_rate: 0.75,
      cost: "0.0115",
    });
    // (1 + 1 + 1 + 3) / 4 finished deliveries
    expect(totals.avg_attempts).toBeCloseTo(1.5);
  });

  test("deleted rows are excluded", async () => {
    const s = await system("shop");
    const u = await user();
    const n = await notification(s, u, "e");
    await delivery(n, { status: "sent" });
    await testSql`UPDATE notifications SET deleted_at = now()`;
    await testSql`UPDATE notification_deliveries SET deleted_at = now()`;
    const { totals } = await overview("?days=7");
    expect(totals).toMatchObject({ notifications: 0, deliveries: 0, sent: 0 });
  });
});

describe("time window", () => {
  test("rows outside the window are excluded; the window before it is the previous period", async () => {
    const s = await system("shop");
    const u = await user();

    // inside the 7-day window
    await delivery(await notification(s, u, "e", "now() - interval '1 day'"), { status: "sent", at: "now() - interval '1 day'" });
    // previous 7-day window
    await delivery(await notification(s, u, "e", "now() - interval '9 days'"), { status: "failed", at: "now() - interval '9 days'" });
    await delivery(await notification(s, u, "e", "now() - interval '10 days'"), { status: "sent", at: "now() - interval '10 days'" });
    // older than both
    await delivery(await notification(s, u, "e", "now() - interval '40 days'"), { status: "sent", at: "now() - interval '40 days'" });

    const data = await overview("?days=7");
    expect(data.totals).toMatchObject({ notifications: 1, deliveries: 1, sent: 1, failed: 0 });
    expect(data.previous).toEqual({ notifications: 2, deliveries: 2, sent: 1, failed: 1 });
  });

  test("daily buckets follow the requested timezone", async () => {
    const s = await system("shop");
    const u = await user();
    // 23:30 UTC yesterday = 00:30 today in Paris (UTC+1 in winter, +2 in summer)
    const at = "date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '30 minutes'";
    await delivery(await notification(s, u, "e", at), { status: "sent", at });

    const utc   = await overview("?days=3&timezone=UTC");
    const paris = await overview(`?days=3&timezone=${encodeURIComponent("Europe/Paris")}`);

    expect(utc.daily.map((d: { sent: number }) => d.sent)).toEqual([0, 1, 0]);
    expect(paris.daily.map((d: { sent: number }) => d.sent)).toEqual([0, 0, 1]);
    // the last bucket is "today" in that zone
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    expect(paris.daily.at(-1).date).toBe(today);
  });

  test("daily rows split sent, failed, in-progress and skipped", async () => {
    const s = await system("shop");
    const u = await user();
    // one delivery per channel per notification, so one notification each
    for (const status of ["sent", "sent", "failed", "pending", "retrying", "skipped", "cancelled"]) {
      await delivery(await notification(s, u, "e"), { status });
    }
    const today = (await overview("?days=1")).daily;
    expect(today).toHaveLength(1);
    // cancelled counts with skipped: neither was attempted
    expect(today[0]).toMatchObject({ notifications: 7, sent: 2, failed: 1, in_progress: 2, skipped: 2 });
  });
});

describe("breakdowns", () => {
  test("channels, providers (incl. idle ones), event types and systems", async () => {
    const shop    = await system("shop");
    const billing = await system("billing");
    const u       = await user();
    const ses     = await provider("ses");
    const twilio  = await provider("twilio", "sms", "twilio");
    await provider("idle-backup", "email", "smtp", false);

    for (let i = 0; i < 3; i++) {
      const n = await notification(shop, u, "order.confirmed");
      const d = await delivery(n, { channel: "email", status: "sent", providerId: ses });
      await usage(d, ses, "0.0001");
      if (i === 0) {
        const sms = await delivery(n, { channel: "sms", status: "failed", providerId: twilio, attempts: 2, error: "unreachable" });
        await usage(sms, twilio, "0.0079");
        await usage(sms, twilio, "0.0079");
      }
    }
    const invoice = await notification(billing, u, "invoice.paid");
    await delivery(invoice, { channel: "telegram", status: "sent" }); // no provider recorded

    const data = await overview("?days=7");

    expect(data.channels).toEqual([
      { channel: "email",    deliveries: 3, sent: 3, failed: 0, in_progress: 0, skipped: 0 },
      { channel: "sms",      deliveries: 1, sent: 0, failed: 1, in_progress: 0, skipped: 0 },
      { channel: "telegram", deliveries: 1, sent: 1, failed: 0, in_progress: 0, skipped: 0 },
    ]);

    expect(data.providers.map((p: Record<string, unknown>) => [p.name, p.deliveries, p.sent, p.failed, p.attempts, p.cost, p.is_active])).toEqual([
      ["ses",         3, 3, 0, 3, "0.0003", true],
      ["twilio",      1, 0, 1, 2, "0.0158", true],
      ["idle-backup", 0, 0, 0, 0, "0",      false],
    ]);

    expect(data.event_types).toEqual([
      { event_type: "order.confirmed", notifications: 3, sent: 3, failed: 1 },
      { event_type: "invoice.paid",    notifications: 1, sent: 1, failed: 0 },
    ]);

    expect(data.systems.map((s: Record<string, unknown>) => [s.name, s.notifications, s.sent, s.failed])).toEqual([
      ["shop",    3, 3, 1],
      ["billing", 1, 1, 0],
    ]);
  });

  test("top lists are capped at 8", async () => {
    const s = await system("shop");
    const u = await user();
    for (let i = 0; i < 10; i++) await notification(s, u, `event.${i}`);
    expect((await overview("?days=1")).event_types).toHaveLength(8);
  });

  test("recent failures: newest first, with context, capped at 8", async () => {
    const s = await system("shop");
    const u = await user();
    const p = await provider("ses");
    for (let i = 0; i < 10; i++) {
      const at = `now() - interval '${i} hours'`;
      await delivery(await notification(s, u, `e${i}`, at), { status: "failed", providerId: p, error: `boom ${i}`, attempts: 2, at });
    }
    await delivery(await notification(s, u, "fine"), { status: "sent" });

    const failures = (await overview("?days=2")).recent_failures;
    expect(failures).toHaveLength(8);
    expect(failures[0]).toMatchObject({
      channel: "email", event_type: "e0", system_name: "shop", provider_name: "ses", last_error: "boom 0", attempt_count: 2,
    });
    expect(failures.map((f: { last_error: string }) => f.last_error)).toEqual(Array.from({ length: 8 }, (_, i) => `boom ${i}`));
  });

  test("inventory counts what exists right now", async () => {
    await system("a");
    const gone = await system("b");
    await testSql`UPDATE external_systems SET deleted_at = now() WHERE id = ${gone}`;
    await user();
    await provider("on");
    await provider("off", "email", "smtp", false);

    expect((await overview()).inventory).toEqual({
      users: 1, external_systems: 1, templates: 0, providers_active: 1, providers_total: 2,
    });
  });
});

describe("query validation", () => {
  test.each([
    ["?days=0",   "days must be a whole number from 1 to 365"],
    ["?days=366", "days must be a whole number from 1 to 365"],
    ["?days=1.5", "days must be a whole number from 1 to 365"],
    ["?timezone=Mars%2FBase", 'timezone "Mars/Base" is not a known IANA timezone'],
    ["?timezone=UTC%27%3B%20DROP%20TABLE%20users%3B--", "is not a known IANA timezone"],
  ])("%s → 400", async (query, message) => {
    const res = await api("GET", `/api/stats/overview${query}`);
    expect(res.status).toBe(400);
    expect(res.json.message).toContain(message);
  });

  test("non-numeric days → 400", async () => {
    expect((await api("GET", "/api/stats/overview?days=abc")).status).toBe(400);
  });

  test("365 days works", async () => {
    expect((await overview("?days=365")).daily).toHaveLength(365);
  });
});
