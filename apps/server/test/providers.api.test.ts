import { beforeEach, describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Layer } from "effect";
import { PgLive } from "../src/pg";
import { SenderRegistry } from "../src/domain/delivery/senders";
import { Providers } from "../src/domain/providers/providers";
import { decryptSecrets, deriveKey, encryptSecrets } from "../src/domain/providers/provider-secrets";
import { api, resetDb, testSql } from "./support";

const NIL_UUID = "00000000-0000-4000-8000-000000000000";

beforeEach(resetDb);

const smtp = (overrides: Record<string, unknown> = {}) => ({
  channel: "email",
  name:    "Own domain",
  kind:    "smtp",
  config:  {
    host:       "smtp.acme.test",
    port:       587,
    security:   "starttls",
    username:   "noreply@acme.test",
    from_email: "noreply@acme.test",
    from_name:  "Acme",
  },
  secrets: { password: "hunter2-smtp" },
  ...overrides,
});

async function create(body: Record<string, unknown>) {
  const res = await api("POST", "/api/channel-provider", body);
  if (res.status !== 200) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.data;
}

/** Decrypted credentials via the service, the way a sender would get them. */
const resolve = (id: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const providers = yield* Providers;
      return yield* providers.resolveProviderCredentials(id);
    }).pipe(Effect.provide(Providers.layer.pipe(Layer.provide(SenderRegistry.live), Layer.provide(PgLive)))),
  );

describe("create", () => {
  test("own-domain SMTP: config returned, password never returned", async () => {
    const res = await api("POST", "/api/channel-provider", smtp());
    expect(res.status).toBe(200);
    const provider = res.json.data;
    expect(provider).toMatchObject({
      channel:     "email",
      name:        "Own domain",
      kind:        "smtp",
      is_active:   true,
      priority:    100,
      secret_keys: ["password"],
      config:      { host: "smtp.acme.test", port: 587, security: "starttls", from_email: "noreply@acme.test" },
    });
    expect(JSON.stringify(res.json)).not.toContain("hunter2-smtp");
    expect(JSON.stringify((await api("GET", `/api/channel-provider/${provider.id}`)).json)).not.toContain("hunter2-smtp");
    expect(JSON.stringify((await api("GET", "/api/channel-provider")).json)).not.toContain("hunter2-smtp");
  });

  test("the password is encrypted at rest and decrypts for the sender", async () => {
    const provider = await create(smtp());
    const [row]    = await testSql`SELECT secrets, config FROM channel_providers WHERE id = ${provider.id}`;
    expect(Buffer.from(row.secrets).toString("utf8")).not.toContain("hunter2");
    expect(JSON.stringify(row.config)).not.toContain("hunter2");

    const credentials = await resolve(provider.id);
    expect(credentials).toMatchObject({ kind: "smtp", secrets: { password: "hunter2-smtp" } });
  });

  test.each([
    ["sendgrid",     "email",    { from_email: "a@acme.test" },                                         { api_key: "SG.x" }],
    ["mailgun",      "email",    { domain: "mg.acme.test", region: "eu", from_email: "a@acme.test" },   { api_key: "key-x" }],
    ["amazon_ses",   "email",    { region: "eu-west-3", access_key_id: "AKIA1", from_email: "a@acme.test" }, { secret_access_key: "s" }],
    ["postmark",     "email",    { from_email: "a@acme.test" },                                         { server_token: "t" }],
    ["resend",       "email",    { from_email: "a@acme.test" },                                         { api_key: "re_x" }],
    ["twilio",       "sms",      { account_sid: "AC1", from_number: "+33612345678" },                   { auth_token: "t" }],
    ["vonage",       "sms",      { api_key: "k", from: "Acme" },                                        { api_secret: "s" }],
    ["telegram_bot", "telegram", {},                                                                    { bot_token: "123:abc" }],
  ])("%s", async (kind, channel, config, secrets) => {
    const res = await api("POST", "/api/channel-provider", { channel, kind, name: `p-${kind}`, config, secrets });
    expect(res.status).toBe(200);
    expect(res.json.data.secret_keys).toEqual(Object.keys(secrets));
  });

  test("catalog defaults fill omitted settings", async () => {
    const provider = await create({ channel: "telegram", kind: "telegram_bot", name: "bot", config: {}, secrets: { bot_token: "1:a" } });
    expect(provider.config).toEqual({ parse_mode: "HTML" });
    const pm = await create({ channel: "email", kind: "postmark", name: "pm", config: { from_email: "a@b.test" }, secrets: { server_token: "x" } });
    expect(pm.config.message_stream).toBe("outbound");
  });

  test("SMTP without auth (open relay on a private network) is allowed", async () => {
    const res = await api("POST", "/api/channel-provider", smtp({
      config:  { host: "relay.internal", port: 25, security: "none", from_email: "a@acme.test" },
      secrets: {},
    }));
    expect(res.status).toBe(200);
    expect(res.json.data.secret_keys).toEqual([]);
  });

  test("priority and active flag are stored; list is ordered by channel, priority, name", async () => {
    await create(smtp({ name: "backup", priority: 50 }));
    await create(smtp({ name: "primary", priority: 10, is_active: false }));
    await create({ channel: "sms", kind: "twilio", name: "sms", config: { account_sid: "AC", from_number: "+15550001111" }, secrets: { auth_token: "t" } });

    const all = (await api("GET", "/api/channel-provider")).json.data.items;
    expect(all.map((p: { name: string }) => p.name)).toEqual(["primary", "backup", "sms"]);
    expect(all[0].is_active).toBe(false);

    const email = (await api("GET", "/api/channel-provider?channel=email")).json.data;
    expect(email.total).toBe(2);
  });
});

describe("validation", () => {
  const expect422 = async (body: Record<string, unknown>, ...issues: Array<string>) => {
    const res = await api("POST", "/api/channel-provider", body);
    expect(res.status).toBe(422);
    expect(res.json._tag).toBe("ProviderInvalid");
    for (const issue of issues) expect(res.json.issues).toContain(issue);
    expect((await api("GET", "/api/channel-provider")).json.data.total).toBe(0);
  };

  test("unknown kind", () => expect422(smtp({ kind: "carrier-pigeon" }), 'kind: unknown provider "carrier-pigeon"'));
  test("kind for another channel", () => expect422(smtp({ channel: "sms" }), "kind: Own domain (SMTP) is a email provider, not sms"));
  test("missing required settings and secrets", () =>
    expect422({ channel: "email", kind: "sendgrid", name: "sg", config: {} }, "api_key: is required", "from_email: is required"));
  test("bad email", () => expect422(smtp({ config: { ...smtp().config, from_email: "not-an-email" } }), "from_email: must be an email address"));
  test("bad port", () => expect422(smtp({ config: { ...smtp().config, port: 70000 } }), "port: must be between 1 and 65535"));
  test("bad host", () => expect422(smtp({ config: { ...smtp().config, host: "smtp acme" } }), "host: must be a hostname like smtp.yourdomain.com"));
  test("bad select value", () => expect422(smtp({ config: { ...smtp().config, security: "ssl3" } }), "security: must be one of starttls, tls, none"));
  test("username without password", () =>
    expect422(smtp({ secrets: {} }), "password: username and password go together — set both or neither"));
  test("bad phone", () =>
    expect422({ channel: "sms", kind: "twilio", name: "t", config: { account_sid: "AC", from_number: "0612345678" }, secrets: { auth_token: "x" } },
      "from_number: must be in E.164 format, e.g. +33612345678"));
  test("unknown setting", () => expect422(smtp({ config: { ...smtp().config, colour: "red" } }), "colour: not a setting of Own domain (SMTP)"));
  test("secret sent as plain config", () =>
    expect422(smtp({ config: { ...smtp().config, password: "oops" } }), 'password: is a secret — send it in "secrets", not "config"'));
  test("blank name", () => expect422(smtp({ name: "  " }), "name: must not be empty"));
  test("priority out of range", () => expect422(smtp({ priority: 5000 }), "priority: must be a whole number between 0 and 1000"));

  test("duplicate name → 409", async () => {
    await create(smtp());
    expect((await api("POST", "/api/channel-provider", smtp())).status).toBe(409);
  });
});

describe("update", () => {
  test("changing settings keeps the stored password", async () => {
    const provider = await create(smtp());
    const res = await api("PATCH", `/api/channel-provider/${provider.id}`, {
      config: { ...smtp().config, host: "mail.acme.test", port: 465, security: "tls" },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.config).toMatchObject({ host: "mail.acme.test", port: 465, security: "tls" });
    expect(res.json.data.secret_keys).toEqual(["password"]);
    expect((await resolve(provider.id)).secrets).toEqual({ password: "hunter2-smtp" });
  });

  test("an empty string for a secret keeps it (blank password field in a form)", async () => {
    const provider = await create(smtp());
    await api("PATCH", `/api/channel-provider/${provider.id}`, { name: "renamed", secrets: { password: "" } });
    expect((await resolve(provider.id)).secrets).toEqual({ password: "hunter2-smtp" });
  });

  test("a new value replaces the secret", async () => {
    const provider = await create(smtp());
    await api("PATCH", `/api/channel-provider/${provider.id}`, { secrets: { password: "rotated" } });
    expect((await resolve(provider.id)).secrets).toEqual({ password: "rotated" });
  });

  test("null clears an optional secret (with its paired username)", async () => {
    const provider = await create(smtp());
    const res = await api("PATCH", `/api/channel-provider/${provider.id}`, {
      config:  { host: "relay.internal", port: 25, security: "none", from_email: "a@acme.test" },
      secrets: { password: null },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.secret_keys).toEqual([]);
    expect((await resolve(provider.id)).secrets).toEqual({});
  });

  test("clearing a required secret → 422 and nothing changes", async () => {
    const provider = await create({ channel: "email", kind: "resend", name: "r", config: { from_email: "a@b.test" }, secrets: { api_key: "re_1" } });
    const res = await api("PATCH", `/api/channel-provider/${provider.id}`, { secrets: { api_key: null } });
    expect(res.status).toBe(422);
    expect(res.json.issues).toContain("api_key: is required");
    expect((await resolve(provider.id)).secrets).toEqual({ api_key: "re_1" });
  });

  test("toggle active and change priority without touching config", async () => {
    const provider = await create(smtp());
    const res = await api("PATCH", `/api/channel-provider/${provider.id}`, { is_active: false, priority: 5 });
    expect(res.json.data).toMatchObject({ is_active: false, priority: 5, config: provider.config });
  });

  test("invalid config on update → 422 and nothing changes", async () => {
    const provider = await create(smtp());
    const res = await api("PATCH", `/api/channel-provider/${provider.id}`, { config: { ...smtp().config, from_email: "nope" } });
    expect(res.status).toBe(422);
    expect((await api("GET", `/api/channel-provider/${provider.id}`)).json.data.config.from_email).toBe("noreply@acme.test");
  });

  test("unknown or deleted provider → 404", async () => {
    expect((await api("PATCH", `/api/channel-provider/${NIL_UUID}`, { name: "x" })).status).toBe(404);
    const provider = await create(smtp());
    expect((await api("DELETE", `/api/channel-provider/${provider.id}`)).status).toBe(204);
    expect((await api("PATCH", `/api/channel-provider/${provider.id}`, { name: "x" })).status).toBe(404);
  });

  test("legacy providers without a kind can be renamed but not configured", async () => {
    const [{ id }] = await testSql`INSERT INTO channel_providers (channel, name) VALUES ('email', 'legacy') RETURNING id`;
    expect((await api("GET", `/api/channel-provider/${id}`)).json.data).toMatchObject({ kind: null, config: {}, secret_keys: [] });
    expect((await api("PATCH", `/api/channel-provider/${id}`, { name: "legacy-2" })).status).toBe(200);
    const res = await api("PATCH", `/api/channel-provider/${id}`, { config: { host: "x.test" } });
    expect(res.status).toBe(422);
    expect(res.json.message).toContain("created before provider configuration existed");
  });
});

describe("secret encryption", () => {
  const key = deriveKey("a passphrase");

  test("round-trips", () => {
    const blob = encryptSecrets(key, "provider-a", { api_key: "k" });
    expect(decryptSecrets(key, "provider-a", blob)).toEqual({ api_key: "k" });
  });

  test("a blob moved to another provider row doesn't decrypt", () => {
    const blob = encryptSecrets(key, "provider-a", { api_key: "k" });
    expect(decryptSecrets(key, "provider-b", blob)).toBeNull();
  });

  test("a different key doesn't decrypt", () => {
    const blob = encryptSecrets(key, "p", { api_key: "k" });
    expect(decryptSecrets(deriveKey("another"), "p", blob)).toBeNull();
  });

  test("tampering is detected", () => {
    const blob = encryptSecrets(key, "p", { api_key: "k" });
    blob[blob.length - 1] ^= 0xff;
    expect(decryptSecrets(key, "p", blob)).toBeNull();
  });

  test("fresh IV every time", () => {
    const a = encryptSecrets(key, "p", { api_key: "k" });
    const b = encryptSecrets(key, "p", { api_key: "k" });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  test("a 32-byte base64 key is used as-is; anything else is hashed", () => {
    const raw = Buffer.alloc(32, 7);
    expect(deriveKey(raw.toString("base64")).equals(raw)).toBe(true);
    expect(deriveKey("short").length).toBe(32);
  });
});

describe("without PROVIDER_SECRET_KEY", () => {
  // A service built from an environment that lacks the key. `local: true`
  // stops Effect reusing an instance memoized by an earlier test.
  const { PROVIDER_SECRET_KEY: _omitted, ...envWithoutKey } = process.env;
  const ServiceWithoutKey = Providers.layer.pipe(
    Layer.provide(SenderRegistry.live),
    Layer.provide(PgLive),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: envWithoutKey as Record<string, string> }))),
  );
  const run = <A, E>(f: (providers: Providers["Service"]) => Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      return yield* f(yield* Providers);
    }).pipe(Effect.provide(ServiceWithoutKey, { local: true }));

  test("saving credentials fails with a clear 503-class error", async () => {
    const error = await Effect.runPromise(
      run((providers) =>
        providers.addChannelProvider({
          channel: "email", kind: "resend", name: "r", config: { from_email: "a@b.test" }, secrets: { api_key: "x" },
        }),
      ).pipe(Effect.flip),
    );
    expect(error).toMatchObject({ _tag: "ProviderSecretsUnavailable" });
    expect((error as { message: string }).message).toContain("PROVIDER_SECRET_KEY is not set");
  });

  test("a provider without credentials still saves", async () => {
    const provider = await Effect.runPromise(
      run((providers) =>
        providers.addChannelProvider({
          channel: "email", kind: "smtp", name: "relay",
          config:  { host: "relay.internal", port: 25, security: "none", from_email: "a@b.test" },
        }),
      ),
    );
    expect(provider.secret_keys).toEqual([]);
  });

  test("credentials saved under another key are reported, not returned garbled", async () => {
    const provider = await create(smtp());
    await testSql`UPDATE channel_providers SET secrets = ${Buffer.from(encryptSecrets(deriveKey("old key"), provider.id, { password: "x" }))} WHERE id = ${provider.id}`;
    const res = await api("PATCH", `/api/channel-provider/${provider.id}`, { secrets: { password: "new" } });
    expect(res.status).toBe(503);
    expect(res.json.message).toContain("PROVIDER_SECRET_KEY has changed");
  });
});
