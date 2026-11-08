// The delivery pipeline end to end: fan-out on POST /notification, the
// worker (run on demand via POST /delivery/process), failover, retries,
// the circuit breaker, and the operator actions.
import { beforeEach, describe, expect, test } from "bun:test";
import { retryDelayMs } from "../src/domain/delivery/backoff";
import {
  addContact,
  api,
  createProvider,
  createSystem,
  createTemplate,
  createUser,
  fail,
  fakeSenders,
  makeAllDue,
  processQueue,
  resetDb,
  testSql,
} from "./support";

beforeEach(async () => {
  await resetDb();
  fakeSenders.reset();
});

/** A system with an email template, and a user with an email contact. */
async function setup(options: { email?: string | null; name?: string } = {}) {
  const system = await createSystem();
  await createTemplate({
    external_system_id: system.id,
    event_type:         "order.shipped",
    template:           "<p>Hello {{name}}, order {{order_id}} is on its way.</p>",
    subject:            "Order {{order_id}} shipped",
  });
  const user = await createUser(options.name);
  const email = options.email === undefined ? "dara@example.com" : options.email;
  if (email !== null) await addContact(user.id, "email", email);
  return { system, user };
}

async function notify(systemId: string, userId: string, extra: Record<string, unknown> = {}) {
  const res = await api("POST", "/api/notification", {
    external_system_id: systemId,
    user_id:            userId,
    event_type:         "order.shipped",
    payload:            { name: "Dara", order_id: "A-42" },
    ...extra,
  });
  if (res.status !== 200) throw new Error(`notify failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data as { id: string };
}

async function deliveriesOf(notificationId: string) {
  const res = await api("GET", `/api/delivery?notification_id=${notificationId}`);
  return res.json.data.items as Array<Record<string, any>>;
}

async function onlyDelivery(notificationId: string) {
  const items = await deliveriesOf(notificationId);
  expect(items).toHaveLength(1);
  return items[0]!;
}

describe("fan-out", () => {
  test("one delivery per channel with a template; channels without a contact are skipped with a reason", async () => {
    const { system, user } = await setup();
    await createTemplate({ external_system_id: system.id, event_type: "order.shipped", channel: "sms", template: "Order {{order_id}}", subject: null });

    const n     = await notify(system.id, user.id);
    const items = await deliveriesOf(n.id);
    const byChannel = Object.fromEntries(items.map((item) => [item.channel, item]));

    expect(byChannel.email).toMatchObject({ status: "pending", recipient: "dara@example.com", attempt_count: 0, max_attempts: 5 });
    expect(byChannel.sms).toMatchObject({ status: "skipped", last_error: "User has no sms contact", recipient: null });
  });

  test("a channel the user turned off is skipped", async () => {
    const { system, user } = await setup();
    await api("PUT", `/api/user/${user.id}/preferences`, { channel: "email", enabled: false });
    const delivery = await onlyDelivery((await notify(system.id, user.id)).id);
    expect(delivery).toMatchObject({ status: "skipped", last_error: "User turned off email notifications" });
  });

  test("Telegram needs a linked account", async () => {
    const { system, user } = await setup();
    await createTemplate({ external_system_id: system.id, event_type: "order.shipped", channel: "telegram", template: "Hi", subject: null });
    await addContact(user.id, "telegram", "123456", false);
    const items = await deliveriesOf((await notify(system.id, user.id)).id);
    expect(items.find((item) => item.channel === "telegram")).toMatchObject({ status: "skipped", last_error: "User has not linked Telegram" });
  });

  test("`channels` limits fan-out", async () => {
    const { system, user } = await setup();
    await createTemplate({ external_system_id: system.id, event_type: "order.shipped", channel: "sms", template: "x", subject: null });
    const items = await deliveriesOf((await notify(system.id, user.id, { channels: ["email"] })).id);
    expect(items.map((item) => item.channel)).toEqual(["email"]);
  });
});

describe("sending", () => {
  test("renders the template and sends through the provider", async () => {
    const { system, user } = await setup({ name: "Dara Sok" });
    const provider = await createProvider();
    const n        = await notify(system.id, user.id);

    expect(await processQueue()).toEqual({ claimed: 1, sent: 1, retrying: 0, failed: 0 });

    expect(fakeSenders.sent).toHaveLength(1);
    const { message, providerId } = fakeSenders.sent[0]!;
    expect(providerId).toBe(provider.id);
    expect(message.to).toBe("dara@example.com");
    expect(message.subject).toBe("Order A-42 shipped");
    expect(message.body).toContain("Hello Dara, order A-42 is on its way.");

    const delivery = await onlyDelivery(n.id);
    expect(delivery).toMatchObject({
      status: "sent", attempt_count: 1, provider_id: provider.id, provider_name: provider.name,
      user_display_name: "Dara Sok", system_name: system.name, in_flight: false, last_error: null,
    });
    expect(delivery.sent_at).not.toBeNull();

    const detail = (await api("GET", `/api/delivery/${delivery.id}`)).json.data;
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0]).toMatchObject({ success: true, provider_name: provider.name, status_code: 202 });

    // nothing left to do
    expect((await processQueue()).claimed).toBe(0);
  });

  test("fails over to the next provider by priority", async () => {
    const { system, user } = await setup();
    const primary  = await createProvider({ priority: 10 });
    const fallback = await createProvider({ priority: 20 });
    fakeSenders.respond(primary.id, fail("upstream timeout", true));

    const n = await notify(system.id, user.id);
    await processQueue();

    expect(fakeSenders.sent.map((sent) => sent.providerId)).toEqual([primary.id, fallback.id]);
    const delivery = await onlyDelivery(n.id);
    expect(delivery).toMatchObject({ status: "sent", provider_id: fallback.id, attempt_count: 1 });

    const attempts = (await api("GET", `/api/delivery/${delivery.id}`)).json.data.attempts;
    expect(attempts.map((a: { success: boolean }) => a.success).sort()).toEqual([false, true]);

    const health = (await api("GET", `/api/channel-provider/${primary.id}`)).json.data;
    expect(health).toMatchObject({ consecutive_failures: 1, last_error: "upstream timeout" });
  });

  test("a transient failure is retried with backoff, then gives up after max attempts", async () => {
    const { system, user } = await setup();
    const provider = await createProvider();
    fakeSenders.respond(provider.id, fail("503 Service Unavailable", true));
    const n = await notify(system.id, user.id);

    await processQueue();
    let delivery = await onlyDelivery(n.id);
    expect(delivery).toMatchObject({ status: "retrying", attempt_count: 1 });
    expect(delivery.last_error).toContain("503 Service Unavailable");
    // not due yet: the worker leaves it alone
    expect(new Date(delivery.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 15_000);
    expect((await processQueue()).claimed).toBe(0);

    for (let attempt = 2; attempt <= 5; attempt++) {
      await makeAllDue();
      await processQueue();
    }
    delivery = await onlyDelivery(n.id);
    expect(delivery).toMatchObject({ status: "failed", attempt_count: 5 });
    expect(delivery.last_error).toContain("gave up after 5 attempts");
  });

  test("a permanent failure fails at once", async () => {
    const { system, user } = await setup();
    const provider = await createProvider();
    fakeSenders.respond(provider.id, fail("550 Recipient address rejected", false));
    const n = await notify(system.id, user.id);
    await processQueue();
    expect(await onlyDelivery(n.id)).toMatchObject({ status: "failed", attempt_count: 1 });
  });

  test("no provider configured: stays queued with a clear reason", async () => {
    const { system, user } = await setup();
    const n = await notify(system.id, user.id);
    await processQueue();
    expect(await onlyDelivery(n.id)).toMatchObject({
      status: "retrying", last_error: "No active email provider is configured",
    });
  });

  test("inactive providers are not used", async () => {
    const { system, user } = await setup();
    await createProvider({ is_active: false });
    const active = await createProvider({ priority: 500 });
    await notify(system.id, user.id);
    await processQueue();
    expect(fakeSenders.sent.map((sent) => sent.providerId)).toEqual([active.id]);
  });

  test("a template deleted after fan-out fails the delivery with the reason", async () => {
    const { system, user } = await setup();
    await createProvider();
    const n = await notify(system.id, user.id);
    const templates = (await api("GET", `/api/notification-template?external_system_id=${system.id}`)).json.data.items;
    await api("DELETE", `/api/notification-template/${templates[0].id}`);
    await processQueue();
    const delivery = await onlyDelivery(n.id);
    expect(delivery.status).toBe("failed");
    expect(delivery.last_error).toContain("it was deleted");
    expect(fakeSenders.sent).toHaveLength(0);
  });

  test("concurrent workers never send the same delivery twice", async () => {
    const { system, user } = await setup();
    await createProvider();
    for (let i = 0; i < 12; i++) await notify(system.id, user.id);

    const runs = await Promise.all([processQueue(), processQueue(), processQueue()]);
    expect(runs.reduce((sum, run) => sum + run.sent, 0)).toBe(12);
    expect(fakeSenders.sent).toHaveLength(12);
  });

  test("an expired lease hands the delivery to another worker", async () => {
    const { system, user } = await setup();
    await createProvider();
    const n = await notify(system.id, user.id);
    // a worker claimed it and died
    await testSql`UPDATE notification_deliveries SET locked_by = 'dead-worker', locked_until = now() + interval '1 minute'`;
    expect((await processQueue()).claimed).toBe(0);
    expect((await onlyDelivery(n.id)).in_flight).toBe(true);

    await testSql`UPDATE notification_deliveries SET locked_until = now() - interval '1 second'`;
    expect((await processQueue()).sent).toBe(1);
  });
});

describe("circuit breaker", () => {
  test("a provider that keeps failing cools down and healthy providers go first", async () => {
    const { system, user } = await setup();
    const flaky  = await createProvider({ priority: 10 });
    const steady = await createProvider({ priority: 20 });
    fakeSenders.respond(flaky.id, fail("connection reset", true));

    for (let i = 0; i < 3; i++) {
      await notify(system.id, user.id);
      await processQueue();
    }
    const health = (await api("GET", `/api/channel-provider/${flaky.id}`)).json.data;
    expect(health.consecutive_failures).toBe(3);
    expect(new Date(health.cooldown_until).getTime()).toBeGreaterThan(Date.now());

    // while cooling down, the steady provider is tried first
    fakeSenders.sent.length = 0;
    await notify(system.id, user.id);
    await processQueue();
    expect(fakeSenders.sent.map((sent) => sent.providerId)).toEqual([steady.id]);

    // reset from the dashboard
    const reset = (await api("POST", `/api/channel-provider/${flaky.id}/reset-health`)).json.data;
    expect(reset).toMatchObject({ consecutive_failures: 0, cooldown_until: null });
  });

  test("a transient recipient problem (mailbox busy) retries without hurting the provider", async () => {
    const { system, user } = await setup();
    const provider = await createProvider();
    fakeSenders.respond(provider.id, () => ({
      ok: false, retryable: true, recipientError: true, statusCode: 451, error: "Mailbox busy", raw: null,
    }));
    for (let i = 0; i < 4; i++) {
      await notify(system.id, user.id);
      await processQueue();
    }
    expect((await api("GET", "/api/delivery?status=retrying")).json.data.total).toBe(4);
    const health = (await api("GET", `/api/channel-provider/${provider.id}`)).json.data;
    expect(health).toMatchObject({ consecutive_failures: 0, cooldown_until: null });
  });

  test("recipient errors don't count against the provider", async () => {
    const { system, user } = await setup();
    const provider = await createProvider();
    fakeSenders.respond(provider.id, fail("invalid address", false));
    for (let i = 0; i < 4; i++) {
      await notify(system.id, user.id);
      await processQueue();
    }
    const health = (await api("GET", `/api/channel-provider/${provider.id}`)).json.data;
    expect(health.consecutive_failures).toBe(0);
    expect(health.cooldown_until).toBeNull();
  });
});

describe("operator actions", () => {
  test("retry a failed delivery: it goes out again, with a fresh attempt budget", async () => {
    const { system, user } = await setup();
    const provider = await createProvider();
    fakeSenders.respond(provider.id, fail("bad gateway", false, 502));
    const n = await notify(system.id, user.id);
    await processQueue();
    const failed = await onlyDelivery(n.id);
    expect(failed.status).toBe("failed");

    fakeSenders.responders.clear();
    const retried = await api("POST", `/api/delivery/${failed.id}/retry`);
    expect(retried.status).toBe(200);
    expect(retried.json.data).toMatchObject({ status: "retrying", last_error: null });
    expect(retried.json.data.max_attempts).toBeGreaterThan(failed.attempt_count);

    await processQueue();
    expect(await onlyDelivery(n.id)).toMatchObject({ status: "sent", attempt_count: 2 });
  });

  test("retry picks up a fixed contact address, and revives skipped deliveries", async () => {
    const { system, user } = await setup({ email: null });
    await createProvider();
    const n       = await notify(system.id, user.id);
    const skipped = await onlyDelivery(n.id);
    expect(skipped.status).toBe("skipped");

    // still no contact → 409, stays skipped
    expect((await api("POST", `/api/delivery/${skipped.id}/retry`)).status).toBe(409);
    expect((await onlyDelivery(n.id)).status).toBe("skipped");

    await addContact(user.id, "email", "fixed@example.com");
    const retried = await api("POST", `/api/delivery/${skipped.id}/retry`);
    expect(retried.json.data).toMatchObject({ status: "retrying", recipient: "fixed@example.com" });
    await processQueue();
    expect(fakeSenders.sent[0]!.message.to).toBe("fixed@example.com");
  });

  test("retrying a sent delivery → 409", async () => {
    const { system, user } = await setup();
    await createProvider();
    const n = await notify(system.id, user.id);
    await processQueue();
    const sent = await onlyDelivery(n.id);
    expect((await api("POST", `/api/delivery/${sent.id}/retry`)).status).toBe(409);
  });

  test("cancel a queued delivery: the worker skips it; finished ones can't be cancelled", async () => {
    const { system, user } = await setup();
    await createProvider();
    const n        = await notify(system.id, user.id);
    const queued   = await onlyDelivery(n.id);
    const cancelled = await api("POST", `/api/delivery/${queued.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.data.status).toBe("cancelled");

    expect((await processQueue()).claimed).toBe(0);
    expect(fakeSenders.sent).toHaveLength(0);
    expect((await api("POST", `/api/delivery/${queued.id}/cancel`)).status).toBe(409);
    // a cancelled one can be retried
    expect((await api("POST", `/api/delivery/${queued.id}/retry`)).status).toBe(200);
  });

  test("bulk retry of failed deliveries, filtered by provider", async () => {
    const { system, user } = await setup();
    const provider = await createProvider();
    fakeSenders.respond(provider.id, fail("nope", false));
    for (let i = 0; i < 3; i++) await notify(system.id, user.id);
    await processQueue();

    const res = await api("POST", "/api/delivery/retry-failed", { provider_id: provider.id });
    expect(res.json.data.retried).toBe(3);
    fakeSenders.responders.clear();
    expect((await processQueue()).sent).toBe(3);
  });

  test("unknown or malformed delivery ids", async () => {
    expect((await api("GET", `/api/delivery/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await api("POST", `/api/delivery/${crypto.randomUUID()}/retry`)).status).toBe(404);
    expect((await api("GET", "/api/delivery/nope")).status).toBe(400);
  });
});

describe("reading", () => {
  test("list filters by status, channel and free text", async () => {
    const { system, user } = await setup({ name: "Sophea" });
    const provider = await createProvider();
    await notify(system.id, user.id);
    await notify(system.id, user.id);
    fakeSenders.respond(provider.id, fail("mailbox full", false));
    await processQueue();

    const failed = (await api("GET", "/api/delivery?status=failed")).json.data;
    expect(failed.total).toBe(2);
    expect((await api("GET", "/api/delivery?status=sent")).json.data.total).toBe(0);
    expect((await api("GET", "/api/delivery?q=mailbox")).json.data.total).toBe(2);
    expect((await api("GET", "/api/delivery?q=sophea")).json.data.total).toBe(2);
    expect((await api("GET", "/api/delivery?q=nothing-matches")).json.data.total).toBe(0);
    expect((await api("GET", "/api/delivery?limit=1")).json.data).toMatchObject({ total: 2, limit: 1 });
  });

  test("queue stats", async () => {
    const { system, user } = await setup();
    await notify(system.id, user.id);
    await notify(system.id, user.id);
    const queue = (await api("GET", "/api/delivery/queue")).json.data;
    expect(queue).toMatchObject({ pending: 2, retrying: 0, in_flight: 0, due: 2, worker_enabled: true });
    expect(queue.oldest_due_age_s).toBeGreaterThanOrEqual(0);
  });

  test("notification list rolls up delivery outcomes and filters by them", async () => {
    const { system, user } = await setup({ name: "Vanna" });
    const provider = await createProvider();
    await notify(system.id, user.id);
    await processQueue();
    fakeSenders.respond(provider.id, fail("rejected", false));
    await notify(system.id, user.id);
    await processQueue();

    const all = (await api("GET", "/api/notification")).json.data;
    expect(all.total).toBe(2);
    expect(all.items[0]).toMatchObject({ user_display_name: "Vanna", system_name: system.name, deliveries_total: 1, channels: ["email"] });
    expect((await api("GET", "/api/notification?outcome=failed")).json.data.total).toBe(1);
    expect((await api("GET", "/api/notification?outcome=sent")).json.data.total).toBe(1);
    expect((await api("GET", `/api/notification?user_id=${user.id}`)).json.data.total).toBe(2);
  });
});

describe("provider test send", () => {
  test("sends a test message and reports the outcome", async () => {
    const provider = await createProvider();
    const res      = await api("POST", `/api/channel-provider/${provider.id}/test`, { to: "me@example.com" });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ ok: true, recipient: "me@example.com", error: null });
    expect(fakeSenders.sent[0]!.message.subject).toContain("Test message");

    fakeSenders.respond(provider.id, fail("Invalid API key", false, 401));
    const failed = (await api("POST", `/api/channel-provider/${provider.id}/test`, { to: "me@example.com" })).json.data;
    expect(failed).toMatchObject({ ok: false, error: "Invalid API key", status_code: 401, retryable: false });
  });

  test("recipient must suit the channel", async () => {
    const email = await createProvider();
    expect((await api("POST", `/api/channel-provider/${email.id}/test`, { to: "+33612345678" })).status).toBe(422);
    const sms = await createProvider({
      channel: "sms", kind: "twilio", config: { account_sid: "AC1", from_number: "+33600000000" }, secrets: { auth_token: "t" },
    });
    expect((await api("POST", `/api/channel-provider/${sms.id}/test`, { to: "me@example.com" })).status).toBe(422);
    expect((await api("POST", `/api/channel-provider/${sms.id}/test`, { to: "+33612345678" })).status).toBe(200);
  });
});

describe("users have readable names", () => {
  test("display_name falls back from name to email to linked id to a short id", async () => {
    const named = await createUser("  Dara Sok  ");
    expect(named).toMatchObject({ name: "Dara Sok", display_name: "Dara Sok" });

    const anonymous = await createUser();
    expect(anonymous.display_name).toBe(`User ${anonymous.id.slice(0, 8)}`);

    await addContact(anonymous.id, "email", "someone@example.com");
    expect((await api("GET", `/api/user/${anonymous.id}`)).json.data).toMatchObject({
      name: null, email: "someone@example.com", display_name: "someone@example.com",
    });
  });

  test("rename, clear, and search", async () => {
    const user    = await createUser("Old Name");
    const renamed = await api("PATCH", `/api/user/${user.id}`, { name: "Chanthy" });
    expect(renamed.json.data.display_name).toBe("Chanthy");
    await createUser("Someone Else");

    expect((await api("GET", "/api/user?q=chan")).json.data.items.map((u: { name: string }) => u.name)).toEqual(["Chanthy"]);

    const cleared = await api("PATCH", `/api/user/${user.id}`, { name: "" });
    expect(cleared.json.data.name).toBeNull();
    expect((await api("PATCH", `/api/user/${crypto.randomUUID()}`, { name: "x" })).status).toBe(404);
  });
});

describe("backoff", () => {
  test("doubles from 30 s, capped at an hour, with jitter", () => {
    const mid = () => 0.5;
    expect(retryDelayMs(1, mid)).toBe(30_000);
    expect(retryDelayMs(2, mid)).toBe(60_000);
    expect(retryDelayMs(4, mid)).toBe(240_000);
    expect(retryDelayMs(30, mid)).toBe(3_600_000);
    expect(retryDelayMs(1, () => 0)).toBe(24_000);
    expect(retryDelayMs(1, () => 1)).toBe(36_000);
  });
});
