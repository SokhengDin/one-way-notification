// Dashboard sign-in and the API's access rules.
import { beforeEach, describe, expect, test } from "bun:test";
import { addContact, api, createSystem, createTemplate, createUser, issueKey, linkUser, resetDb, TEST_ADMIN, testSql } from "./support";

beforeEach(resetDb);

async function makeAdmin(email: string, password: string) {
  await testSql`DELETE FROM admins WHERE lower(email) = lower(${email})`;
  const hash = await Bun.password.hash(password);
  await testSql`INSERT INTO admins (email, name, password_hash) VALUES (${email}, ${"Someone"}, ${hash})`;
}

const login = (email: string, password: string) =>
  api("POST", "/api/auth/login", { email, password }, { token: null });

describe("access rules", () => {
  test("the API needs a session; health and login don't", async () => {
    expect((await api("GET", "/api/user", undefined, { token: null })).status).toBe(401);
    expect((await api("GET", "/api/delivery/queue", undefined, { token: null })).status).toBe(401);
    expect((await api("GET", "/api/user", undefined, { token: "own_not-a-real-session" })).status).toBe(401);
    expect((await api("GET", "/api/user", undefined, { token: "garbage" })).status).toBe(401);
    expect((await api("GET", "/api/health", undefined, { token: null })).status).toBe(204);
    expect((await api("GET", "/api/user")).status).toBe(200);
  });

  test("a 401 says why, in the usual envelope", async () => {
    const res = await api("GET", "/api/user", undefined, { token: null });
    expect(res.json).toMatchObject({ status: 401, message: "Sign in to use this API" });
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });
});

describe("sign in", () => {
  test("right password → token, me, then logout ends the session", async () => {
    await makeAdmin("dara@example.com", "a-long-enough-password");
    const res = await login("DARA@example.com", "a-long-enough-password");
    expect(res.status).toBe(200);
    const { token, admin } = res.json.data;
    expect(token).toStartWith("own_");
    expect(admin).toMatchObject({ email: "dara@example.com", name: "Someone" });
    expect(admin.password_hash).toBeUndefined();

    // only a hash of the token is stored
    const [row] = await testSql`SELECT token_hash FROM admin_sessions ORDER BY created_at DESC LIMIT 1`;
    expect(row.token_hash).not.toBe(token);

    const me = await api("GET", "/api/auth/me", undefined, { token });
    expect(me.json.data.email).toBe("dara@example.com");

    expect((await api("POST", "/api/auth/logout", undefined, { token })).status).toBe(204);
    expect((await api("GET", "/api/auth/me", undefined, { token })).status).toBe(401);
    expect((await api("GET", "/api/user", undefined, { token })).status).toBe(401);
  });

  test("wrong password and unknown email get the same answer", async () => {
    await makeAdmin("sok@example.com", "a-long-enough-password");
    const wrong   = await login("sok@example.com", "nope");
    const unknown = await login("nobody@example.com", "nope");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json.message).toBe(unknown.json.message);
  });

  test("five wrong passwords lock the account, even for the right one", async () => {
    await makeAdmin("lock@example.com", "a-long-enough-password");
    for (let i = 0; i < 4; i++) expect((await login("lock@example.com", "wrong")).status).toBe(401);
    expect((await login("lock@example.com", "wrong")).status).toBe(423);
    const locked = await login("lock@example.com", "a-long-enough-password");
    expect(locked.status).toBe(423);
    expect(locked.json.message).toContain("Try again later");
  });

  test("a success resets the failure count", async () => {
    await makeAdmin("reset@example.com", "a-long-enough-password");
    for (let i = 0; i < 3; i++) await login("reset@example.com", "wrong");
    expect((await login("reset@example.com", "a-long-enough-password")).status).toBe(200);
    const [row] = await testSql`SELECT failed_attempts FROM admins WHERE email = 'reset@example.com'`;
    expect(row.failed_attempts).toBe(0);
  });

  test("the test admin is who the suite signs in as", async () => {
    expect((await api("GET", "/api/auth/me")).json.data.email).toBe(TEST_ADMIN.email);
  });
});

describe("external systems send with their API key", () => {
  async function setup() {
    const system = await createSystem();
    await createTemplate({ external_system_id: system.id, event_type: "order.shipped" });
    const user = await createUser("Dara");
    await addContact(user.id, "email", "dara@example.com");
    await linkUser(system.id, user.id);
    const { secret, key } = await issueKey(system.id);
    const body = { external_system_id: system.id, user_id: user.id, event_type: "order.shipped", payload: { name: "Dara" } };
    return { system, user, body, secret, key };
  }

  const send = (body: unknown, secret: string) =>
    api("POST", "/api/notification", body, { token: null, headers: { "x-api-key": secret } });

  test("their own key works without a session", async () => {
    const { body, secret } = await setup();
    expect((await send(body, secret)).status).toBe(200);
  });

  test("a wrong key, or another system's key, is refused", async () => {
    const { body, secret } = await setup();
    const other = await createSystem();
    const otherKey = await issueKey(other.id);
    expect((await send(body, "wrong")).status).toBe(401);
    expect((await send(body, otherKey.secret)).status).toBe(401);
    // one character off: the checksum catches it
    const typo = secret.slice(0, -1) + (secret.endsWith("A") ? "B" : "A");
    expect((await send(body, typo)).status).toBe(401);
    expect((await api("GET", "/api/notification")).json.data.total).toBe(0);
  });

  test("no key and no session → 401", async () => {
    const { body } = await setup();
    expect((await api("POST", "/api/notification", body, { token: null })).status).toBe(401);
  });

  test("a key opens nothing else", async () => {
    const { secret } = await setup();
    expect((await api("GET", "/api/notification", undefined, { token: null, headers: { "x-api-key": secret } })).status).toBe(401);
    expect((await api("GET", "/api/external-system", undefined, { token: null, headers: { "x-api-key": secret } })).status).toBe(401);
  });

  test("a system can't notify a user that isn't under it", async () => {
    const { body, secret } = await setup();
    const stranger = await createUser("Not ours");
    await addContact(stranger.id, "email", "stranger@example.com");
    const res = await send({ ...body, user_id: stranger.id }, secret);
    expect(res.status).toBe(422);
    expect(res.json.message).toContain("isn't linked to this external system");
  });
});

describe("issued API keys", () => {
  test("look like ownk_…, are shown once and stored only as a hash", async () => {
    const system = await createSystem();
    const { secret, key } = await issueKey(system.id, { name: "Production" });
    expect(secret).toMatch(/^ownk_[0-9A-Za-z]{8}_[0-9A-Za-z]{49}$/);
    expect(secret.startsWith(key.prefix + "_")).toBe(true);
    expect(secret.endsWith(key.last_four)).toBe(true);
    expect(key.status).toBe("active");

    const [row] = await testSql`SELECT * FROM api_keys WHERE id = ${key.id}`;
    expect(Object.values(row).map(String)).not.toContain(secret);
    expect(row.key_hash).toBe(new Bun.CryptoHasher("sha256").update(secret).digest("hex"));

    const listed = (await api("GET", `/api/external-system/${system.id}/api-key`)).json.data;
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(secret);
    expect(listed[0]).toMatchObject({ name: "Production", created_by_name: expect.any(String) });
    expect((await api("GET", `/api/external-system/${system.id}`)).json.data.active_api_keys).toBe(1);
  });

  test("every key is different", async () => {
    const system = await createSystem();
    const a = await issueKey(system.id);
    const b = await issueKey(system.id);
    expect(a.secret).not.toBe(b.secret);
    expect(a.key.prefix).not.toBe(b.key.prefix);
  });

  test("expiry is required and bounded; names are checked", async () => {
    const system = await createSystem();
    const issue = (body: unknown) => api("POST", `/api/external-system/${system.id}/api-key`, body);
    expect((await issue({ name: "x", expires_in_days: 0 })).status).toBe(422);
    expect((await issue({ name: "x", expires_in_days: 731 })).status).toBe(422);
    expect((await issue({ name: "   ", expires_in_days: 30 })).status).toBe(422);
    expect((await issue({ name: "x".repeat(101), expires_in_days: 30 })).status).toBe(422);
    expect((await issue({ name: "x" })).status).toBe(400);
    expect((await issue({ name: "ok", expires_in_days: 730 })).status).toBe(200);
  });

  test("issuing needs a signed-in admin, not a key", async () => {
    const system = await createSystem();
    const { secret } = await issueKey(system.id);
    const res = await api("POST", `/api/external-system/${system.id}/api-key`, { name: "x", expires_in_days: 30 }, { token: null, headers: { "x-api-key": secret } });
    expect(res.status).toBe(401);
  });

  test("revoked keys stop working at once", async () => {
    const system = await createSystem();
    await createTemplate({ external_system_id: system.id, event_type: "e" });
    const user = await createUser();
    await addContact(user.id, "email", "a@example.com");
    await linkUser(system.id, user.id);
    const { secret, key } = await issueKey(system.id);
    const body = { external_system_id: system.id, user_id: user.id, event_type: "e", payload: {} };
    const send = () => api("POST", "/api/notification", body, { token: null, headers: { "x-api-key": secret } });

    expect((await send()).status).toBe(200);
    const revoked = await api("POST", `/api/api-key/${key.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.json.data).toMatchObject({ status: "revoked", revoked_by_name: expect.any(String) });
    expect((await send()).status).toBe(401);

    // hidden from the default list, shown with include_inactive
    expect((await api("GET", `/api/external-system/${system.id}/api-key`)).json.data).toHaveLength(0);
    expect((await api("GET", `/api/external-system/${system.id}/api-key?include_inactive=true`)).json.data).toHaveLength(1);
  });

  test("expired keys stop working", async () => {
    const system = await createSystem();
    await createTemplate({ external_system_id: system.id, event_type: "e" });
    const user = await createUser();
    await addContact(user.id, "email", "a@example.com");
    await linkUser(system.id, user.id);
    const { secret, key } = await issueKey(system.id);
    await testSql`UPDATE api_keys SET expires_at = now() - interval '1 second' WHERE id = ${key.id}`;
    const body = { external_system_id: system.id, user_id: user.id, event_type: "e", payload: {} };
    expect((await api("POST", "/api/notification", body, { token: null, headers: { "x-api-key": secret } })).status).toBe(401);
    const [listed] = (await api("GET", `/api/external-system/${system.id}/api-key?include_inactive=true`)).json.data;
    expect(listed.status).toBe("expired");
  });

  test("a deleted system's keys stop working", async () => {
    const system = await createSystem();
    await createTemplate({ external_system_id: system.id, event_type: "e" });
    const user = await createUser();
    await linkUser(system.id, user.id);
    const { secret } = await issueKey(system.id);
    expect((await api("DELETE", `/api/external-system/${system.id}`)).status).toBe(204);
    const body = { external_system_id: system.id, user_id: user.id, event_type: "e", payload: {} };
    expect((await api("POST", "/api/notification", body, { token: null, headers: { "x-api-key": secret } })).status).toBe(401);
  });

  test("rolling: a new key, the old one keeps working for the grace period", async () => {
    const system = await createSystem();
    const old    = await issueKey(system.id, { name: "Prod" });
    const rolled = await api("POST", `/api/api-key/${old.key.id}/roll`, { grace_hours: 24, expires_in_days: 90 });
    expect(rolled.status).toBe(200);
    expect(rolled.json.data.key.name).toBe("Prod");
    expect(rolled.json.data.secret).not.toBe(old.secret);

    const [row] = await testSql`SELECT expires_at, revoked_at FROM api_keys WHERE id = ${old.key.id}`;
    expect(row.revoked_at).toBeNull();
    const hoursLeft = (new Date(row.expires_at).getTime() - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(23.9);
    expect(hoursLeft).toBeLessThanOrEqual(24);
  });

  test("rolling with no grace revokes the old key; odd grace periods are refused", async () => {
    const system = await createSystem();
    const old = await issueKey(system.id);
    expect((await api("POST", `/api/api-key/${old.key.id}/roll`, { grace_hours: 5, expires_in_days: 90 })).status).toBe(422);
    expect((await api("POST", `/api/api-key/${old.key.id}/roll`, { grace_hours: 0, expires_in_days: 90 })).status).toBe(200);
    const [row] = await testSql`SELECT revoked_at FROM api_keys WHERE id = ${old.key.id}`;
    expect(row.revoked_at).not.toBeNull();
    // a revoked key can't be rolled again
    expect((await api("POST", `/api/api-key/${old.key.id}/roll`, { grace_hours: 0, expires_in_days: 90 })).status).toBe(422);
  });

  test("at most 10 working keys per system", async () => {
    const system = await createSystem();
    const keys = [];
    for (let i = 0; i < 10; i++) keys.push(await issueKey(system.id));
    expect((await api("POST", `/api/external-system/${system.id}/api-key`, { name: "11th", expires_in_days: 30 })).status).toBe(409);
    // rolling with grace needs room; without grace it doesn't
    expect((await api("POST", `/api/api-key/${keys[0]!.key.id}/roll`, { grace_hours: 1, expires_in_days: 30 })).status).toBe(409);
    expect((await api("POST", `/api/api-key/${keys[0]!.key.id}/roll`, { grace_hours: 0, expires_in_days: 30 })).status).toBe(200);
  });

  test("last use is recorded", async () => {
    const system = await createSystem();
    await createTemplate({ external_system_id: system.id, event_type: "e" });
    const user = await createUser();
    await addContact(user.id, "email", "a@example.com");
    await linkUser(system.id, user.id);
    const { secret, key } = await issueKey(system.id);
    const body = { external_system_id: system.id, user_id: user.id, event_type: "e", payload: {} };
    await api("POST", "/api/notification", body, { token: null, headers: { "x-api-key": secret, "x-forwarded-for": "203.0.113.7" } });
    const [row] = await testSql`SELECT last_used_at, last_used_ip FROM api_keys WHERE id = ${key.id}`;
    expect(row.last_used_at).not.toBeNull();
    expect(row.last_used_ip).toBe("203.0.113.7");
  });

  test("unknown system or key → 404", async () => {
    expect((await api("POST", "/api/external-system/00000000-0000-0000-0000-000000000000/api-key", { name: "x", expires_in_days: 30 })).status).toBe(404);
    expect((await api("POST", "/api/api-key/00000000-0000-0000-0000-000000000000/revoke")).status).toBe(404);
  });
});
