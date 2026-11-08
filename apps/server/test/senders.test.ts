// Provider adapters against a fake fetch: request shape and how each
// provider's responses are classified (sent / retry later / give up).
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { makeSenderRegistry, SENDERS } from "../src/domain/delivery/senders";
import { signAwsRequest } from "../src/domain/delivery/senders/sigv4";
import type { OutboundMessage } from "../src/domain/delivery/senders/types";
import type { ProviderCredentials } from "../src/domain/providers/providers.types";

interface Captured {
  url:     string;
  method:  string;
  headers: Headers;
  body:    string;
}

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Array<Captured> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push({ url: request.url, method: request.method, headers: request.headers, body: await request.text() });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const throwingFetch = (async () => {
  throw new TypeError("fetch failed: ECONNREFUSED");
}) as unknown as typeof fetch;

const email: OutboundMessage = {
  channel: "email", to: "dara@example.com", subject: "Hi", body: "<p>Hi</p>", text: "Hi", idempotencyKey: "d-1",
};
const sms: OutboundMessage = {
  channel: "sms", to: "+33612345678", subject: null, body: "Code 1234", text: null, idempotencyKey: "d-2",
};

const creds = (kind: string, config: Record<string, string | number>, secrets: Record<string, string>): ProviderCredentials => ({
  id: "p-1", channel: "email", kind, config, secrets,
});

const send = (fetchImpl: typeof fetch, credentials: ProviderCredentials, message: OutboundMessage, timeoutMs = 5000) =>
  Effect.runPromise(makeSenderRegistry(SENDERS, fetchImpl).send(credentials, message, timeoutMs));

describe("email APIs", () => {
  const resend = creds("resend", { from_email: "noreply@acme.test", from_name: "Acme" }, { api_key: "re_x" });

  test("Resend: request shape and success", async () => {
    const fetch  = fakeFetch(200, { id: "msg_1" });
    const result = await send(fetch.impl, resend, email);
    expect(result).toMatchObject({ ok: true, providerRefId: "msg_1", statusCode: 200 });

    const call = fetch.calls[0]!;
    expect(call.url).toBe("https://api.resend.com/emails");
    expect(call.headers.get("authorization")).toBe("Bearer re_x");
    expect(call.headers.get("idempotency-key")).toBe("d-1");
    expect(JSON.parse(call.body)).toMatchObject({ from: '"Acme" <noreply@acme.test>', to: ["dara@example.com"], subject: "Hi" });
  });

  test("4xx is permanent, 429 and 5xx are retryable", async () => {
    expect(await send(fakeFetch(422, { message: "Invalid `to` field" }).impl, resend, email))
      .toMatchObject({ ok: false, retryable: false, statusCode: 422, error: "Invalid `to` field" });
    expect(await send(fakeFetch(429, { message: "Too many requests" }).impl, resend, email))
      .toMatchObject({ ok: false, retryable: true, statusCode: 429 });
    expect(await send(fakeFetch(503, "<html>down</html>").impl, resend, email))
      .toMatchObject({ ok: false, retryable: true, statusCode: 503 });
  });

  test("network errors are retryable", async () => {
    expect(await send(throwingFetch, resend, email)).toMatchObject({ ok: false, retryable: true, statusCode: null });
  });

  test("a hung provider times out as a retryable failure", async () => {
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    const result = await send(hanging, resend, email, 50);
    expect(result).toMatchObject({ ok: false, retryable: true, error: "Timed out waiting for the provider" });
  });

  test("SendGrid reads the message id header and joins error messages", async () => {
    const sendgrid = creds("sendgrid", { from_email: "noreply@acme.test" }, { api_key: "SG.x" });
    expect(await send(fakeFetch(202, "", { "x-message-id": "sg-1" }).impl, sendgrid, email))
      .toMatchObject({ ok: true, providerRefId: "sg-1" });
    expect(await send(fakeFetch(400, { errors: [{ message: "a" }, { message: "b" }] }).impl, sendgrid, email))
      .toMatchObject({ ok: false, error: "a; b", retryable: false });
  });

  test("Postmark: a 200 with a non-zero ErrorCode is still a failure", async () => {
    const postmark = creds("postmark", { from_email: "noreply@acme.test", message_stream: "outbound" }, { server_token: "t" });
    expect(await send(fakeFetch(200, { ErrorCode: 0, MessageID: "pm-1" }).impl, postmark, email))
      .toMatchObject({ ok: true, providerRefId: "pm-1" });
    expect((await send(fakeFetch(200, { ErrorCode: 406, Message: "Inactive recipient" }).impl, postmark, email)).ok).toBe(false);
  });

  test("Mailgun posts form data to the regional host", async () => {
    const mailgun = creds("mailgun", { domain: "mg.acme.test", region: "eu", from_email: "noreply@acme.test" }, { api_key: "k" });
    const fetch   = fakeFetch(200, { id: "<mg-1>" });
    expect(await send(fetch.impl, mailgun, email)).toMatchObject({ ok: true, providerRefId: "<mg-1>" });
    expect(fetch.calls[0]!.url).toBe("https://api.eu.mailgun.net/v3/mg.acme.test/messages");
  });

  test("Amazon SES requests are SigV4-signed", async () => {
    const ses   = creds("amazon_ses", { region: "eu-west-3", access_key_id: "AKIDEXAMPLE", from_email: "noreply@acme.test" }, { secret_access_key: "secret" });
    const fetch = fakeFetch(200, { MessageId: "ses-1" });
    expect(await send(fetch.impl, ses, email)).toMatchObject({ ok: true, providerRefId: "ses-1" });
    const call = fetch.calls[0]!;
    expect(call.url).toBe("https://email.eu-west-3.amazonaws.com/v2/email/outbound-emails");
    expect(call.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/eu-west-3\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
  });
});

describe("SMS and Telegram", () => {
  test("Twilio", async () => {
    const twilio = { ...creds("twilio", { account_sid: "AC1", from_number: "+33600000000" }, { auth_token: "t" }), channel: "sms" as const };
    const fetch  = fakeFetch(201, { sid: "SM1" });
    expect(await send(fetch.impl, twilio, sms)).toMatchObject({ ok: true, providerRefId: "SM1" });
    expect(new URLSearchParams(fetch.calls[0]!.body).get("To")).toBe("+33612345678");
    expect(await send(fakeFetch(400, { message: "Invalid 'To' Phone Number" }).impl, twilio, sms))
      .toMatchObject({ ok: false, retryable: false, error: "Invalid 'To' Phone Number" });
  });

  test("Vonage reports per-message status inside a 200", async () => {
    const vonage = { ...creds("vonage", { api_key: "k", from: "Acme" }, { api_secret: "s" }), channel: "sms" as const };
    expect(await send(fakeFetch(200, { messages: [{ status: "0", "message-id": "v1" }] }).impl, vonage, sms))
      .toMatchObject({ ok: true, providerRefId: "v1" });
    expect(await send(fakeFetch(200, { messages: [{ status: "1", "error-text": "Throttled" }] }).impl, vonage, sms))
      .toMatchObject({ ok: false, retryable: true, error: "Throttled" });
    expect(await send(fakeFetch(200, { messages: [{ status: "6", "error-text": "Unroutable" }] }).impl, vonage, sms))
      .toMatchObject({ ok: false, retryable: false });
  });

  test("Telegram", async () => {
    const telegram = { ...creds("telegram_bot", { parse_mode: "HTML" }, { bot_token: "123:abc" }), channel: "telegram" as const };
    const message  = { ...sms, channel: "telegram" as const, to: "987654" };
    const fetch    = fakeFetch(200, { ok: true, result: { message_id: 55 } });
    expect(await send(fetch.impl, telegram, message)).toMatchObject({ ok: true, providerRefId: "55" });
    expect(fetch.calls[0]!.url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(fetch.calls[0]!.body)).toMatchObject({ chat_id: "987654", parse_mode: "HTML" });
    expect(await send(fakeFetch(403, { ok: false, description: "Forbidden: bot was blocked by the user" }).impl, telegram, message))
      .toMatchObject({ ok: false, retryable: false, error: "Forbidden: bot was blocked by the user" });
  });
});

describe("registry", () => {
  test("unknown kinds and crashing adapters become failures, never exceptions", async () => {
    expect(await send(fakeFetch(200, {}).impl, creds("carrier-pigeon", {}, {}), email))
      .toMatchObject({ ok: false, retryable: false });
    const crashing = makeSenderRegistry({ boom: async () => { throw new Error("bug"); } }, fetch);
    const result   = await Effect.runPromise(crashing.send(creds("boom", {}, {}), email, 1000));
    expect(result).toMatchObject({ ok: false, retryable: true, error: "Sender crashed: bug" });
  });
});

describe("SigV4", () => {
  // AWS SigV4 test suite, "get-vanilla"
  test("matches the reference signature", () => {
    const headers = signAwsRequest({
      method:          "GET",
      url:             "https://example.amazonaws.com/",
      region:          "us-east-1",
      service:         "service",
      body:            "",
      headers:         {},
      accessKeyId:     "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      now:             new Date("2015-08-30T12:36:00Z"),
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, " +
        "SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
    expect(headers["x-amz-date"]).toBe("20150830T123600Z");
  });
});
