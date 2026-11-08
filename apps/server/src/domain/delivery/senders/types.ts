// What every provider adapter speaks. Adapters are plain async functions —
// no Effect, no database — so each one can be tested against a fake fetch.

import type { ChannelType } from "@repo/schema";
import type { ProviderCredentials } from "../../providers/providers.types";

export interface OutboundMessage {
  readonly channel: ChannelType;
  /** email address, E.164 phone number, or Telegram chat id */
  readonly to:      string;
  /** email only */
  readonly subject: string | null;
  /** email: full HTML document; sms/telegram: plain text */
  readonly body:    string;
  /** email only: text/plain alternative */
  readonly text:    string | null;
  /** stable per delivery, passed to providers that dedupe on it */
  readonly idempotencyKey: string;
}

export type SendResult =
  | {
      readonly ok:            true;
      readonly statusCode:    number | null;
      readonly providerRefId: string | null;
      readonly raw:           Record<string, unknown> | null;
    }
  | {
      readonly ok:         false;
      /** worth trying again later (timeouts, 5xx, rate limits) */
      readonly retryable:  boolean;
      readonly statusCode: number | null;
      readonly error:      string;
      readonly raw:        Record<string, unknown> | null;
    };

export interface SendContext {
  readonly fetch:  typeof fetch;
  readonly signal: AbortSignal;
}

export type Sender = (
  credentials: ProviderCredentials,
  message:     OutboundMessage,
  context:     SendContext,
) => Promise<SendResult>;

// ---------- helpers shared by the HTTP adapters ----------

/** 408, 425, 429 and 5xx are transient; every other 4xx is not. */
export const isRetryableStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || status >= 500;

export const str = (value: unknown): string =>
  typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);

/** "Acme <noreply@acme.com>" or just the address. */
export function formatSender(config: Readonly<Record<string, unknown>>): string {
  const email = str(config.from_email);
  const name  = str(config.from_name).replace(/["<>\r\n]/g, "").trim();
  return name ? `"${name}" <${email}>` : email;
}

export async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { text: text.slice(0, 2000) };
  }
}

export function httpFailure(
  response: Response,
  raw:      Record<string, unknown> | null,
  message:  string | undefined,
): SendResult {
  const detail = message?.trim() || `HTTP ${response.status} ${response.statusText}`.trim();
  return {
    ok:         false,
    retryable:  isRetryableStatus(response.status),
    statusCode: response.status,
    error:      detail.slice(0, 1000),
    raw,
  };
}

/** A thrown fetch error: network failure, DNS, TLS, or our own timeout. */
export function networkFailure(error: unknown): SendResult {
  const message =
    error instanceof Error
      ? error.name === "AbortError" || error.name === "TimeoutError"
        ? "Timed out waiting for the provider"
        : error.message
      : String(error);
  return { ok: false, retryable: true, statusCode: null, error: message.slice(0, 1000), raw: null };
}

export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}
