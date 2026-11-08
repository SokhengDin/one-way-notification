// The SMTP adapter against a real (local, in-process) SMTP server.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { SMTPServer } from "smtp-server";
import { makeSenderRegistry, SENDERS } from "../src/domain/delivery/senders";
import type { ProviderCredentials } from "../src/domain/providers/providers.types";

const received: Array<{ from: string; to: Array<string>; raw: string }> = [];
let port = 0;

const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onAuth(auth, _session, callback) {
    if (auth.username === "user" && auth.password === "pass") callback(null, { user: "user" });
    else callback(new Error("Invalid username or password"));
  },
  onRcptTo(address, _session, callback) {
    if (address.address.endsWith("@rejected.test")) {
      const error = new Error("Recipient address rejected") as Error & { responseCode: number };
      error.responseCode = 550;
      return callback(error);
    }
    if (address.address.endsWith("@busy.test")) {
      const error = new Error("Mailbox busy, try later") as Error & { responseCode: number };
      error.responseCode = 451;
      return callback(error);
    }
    callback();
  },
  onData(stream, session, callback) {
    let raw = "";
    stream.on("data", (chunk) => (raw += chunk.toString()));
    stream.on("end", () => {
      received.push({
        from: String(session.envelope.mailFrom && session.envelope.mailFrom.address),
        to:   session.envelope.rcptTo.map((r) => r.address),
        raw,
      });
      callback();
    });
  },
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  port = (server.server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const creds = (overrides: Record<string, string | number> = {}, secrets: Record<string, string> = { password: "pass" }): ProviderCredentials => ({
  id: "p-smtp", channel: "email", kind: "smtp",
  config: { host: "127.0.0.1", port, security: "none", username: "user", from_email: "noreply@acme.test", from_name: "Acme", ...overrides },
  secrets,
});

const message = (to: string) => ({
  channel: "email" as const, to, subject: "Your order", body: "<p>Shipped</p>", text: "Shipped", idempotencyKey: "d-smtp",
});

const send = (credentials: ProviderCredentials, to: string) =>
  Effect.runPromise(makeSenderRegistry(SENDERS, fetch).send(credentials, message(to), 5000));

describe("SMTP", () => {
  test("delivers with auth, sender name, both bodies and the delivery id header", async () => {
    const result = await send(creds(), "dara@example.com");
    expect(result).toMatchObject({ ok: true, statusCode: 250 });
    const mail = received.at(-1)!;
    expect(mail.from).toBe("noreply@acme.test");
    expect(mail.to).toEqual(["dara@example.com"]);
    expect(mail.raw).toContain("Subject: Your order");
    expect(mail.raw).toContain("From: Acme <noreply@acme.test>");
    expect(mail.raw.toLowerCase()).toContain("x-delivery-id: d-smtp");
    expect(mail.raw).toContain("text/html");
    expect(mail.raw).toContain("text/plain");
  });

  test("5xx is permanent, 4xx is retryable", async () => {
    expect(await send(creds(), "x@rejected.test")).toMatchObject({ ok: false, retryable: false, statusCode: 550 });
    expect(await send(creds(), "x@busy.test")).toMatchObject({ ok: false, retryable: true, statusCode: 451, recipientError: true });
  });

  test("bad credentials are reported as an authentication failure", async () => {
    const result = await send(creds({}, { password: "wrong" }), "dara@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Authentication failed");
  });

  test("an unreachable server is retryable", async () => {
    const result = await send(creds({ port: 1 }), "dara@example.com");
    expect(result).toMatchObject({ ok: false, retryable: true, recipientError: false });
  });
});
