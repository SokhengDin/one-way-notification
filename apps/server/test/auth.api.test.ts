// Dashboard sign-in and the API's access rules.
import { beforeEach, describe, expect, test } from "bun:test";
import { addContact, api, createSystem, createTemplate, createUser, resetDb, TEST_ADMIN, testSql } from "./support";

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
    const body = { external_system_id: system.id, user_id: user.id, event_type: "order.shipped", payload: { name: "Dara" } };
    return { system, body };
  }

  test("their own key works without a session", async () => {
    const { system, body } = await setup();
    const res = await api("POST", "/api/notification", body, { token: null, headers: { "x-api-key": `key-${system.name}` } });
    expect(res.status).toBe(200);
  });

  test("a wrong key, or another system's key, is refused", async () => {
    const { body } = await setup();
    const other = await createSystem();
    expect((await api("POST", "/api/notification", body, { token: null, headers: { "x-api-key": "wrong" } })).status).toBe(401);
    expect((await api("POST", "/api/notification", body, { token: null, headers: { "x-api-key": `key-${other.name}` } })).status).toBe(401);
    expect((await api("GET", "/api/notification")).json.data.total).toBe(0);
  });

  test("no key and no session → 401", async () => {
    const { body } = await setup();
    expect((await api("POST", "/api/notification", body, { token: null })).status).toBe(401);
  });

  test("a key opens nothing else", async () => {
    const { system } = await setup();
    expect((await api("GET", "/api/notification", undefined, { token: null, headers: { "x-api-key": `key-${system.name}` } })).status).toBe(401);
  });
});
