// The one place that knows which adapter serves which provider kind.
//
// `SenderRegistry` is an Effect service so the app can swap it: production
// uses the real adapters over the network, tests provide a scripted fake.
// `send` never fails — every outcome, including a crash inside an adapter
// or a timeout, comes back as a SendResult the pipeline can record.

import { Context, Effect, Layer } from "effect";
import type { ProviderCredentials } from "../../providers/providers.types";
import { amazonSes, mailgun, postmark, resend, sendgrid } from "./email-http";
import { telegramBot, twilio, vonage } from "./messaging";
import { smtp } from "./smtp";
import type { OutboundMessage, Sender, SendResult } from "./types";

export type { OutboundMessage, SendResult } from "./types";

export const SENDERS: Readonly<Record<string, Sender>> = {
  smtp,
  sendgrid,
  mailgun,
  amazon_ses:   amazonSes,
  postmark,
  resend,
  twilio,
  vonage,
  telegram_bot: telegramBot,
};

export type TimedSendResult = SendResult & { readonly durationMs: number };

export interface SenderRegistryService {
  readonly send: (
    credentials: ProviderCredentials,
    message:     OutboundMessage,
    timeoutMs:   number,
  ) => Effect.Effect<TimedSendResult>;
}

export class SenderRegistry extends Context.Service<SenderRegistry, SenderRegistryService>()(
  "app/domain/delivery/SenderRegistry",
) {
  /** Real adapters over the network. */
  static readonly live = Layer.succeed(SenderRegistry, makeSenderRegistry(SENDERS, globalThis.fetch));
}

export function makeSenderRegistry(
  senders: Readonly<Record<string, Sender>>,
  fetchImpl: typeof fetch,
): SenderRegistryService {
  return {
    send: (credentials, message, timeoutMs) =>
      Effect.promise(async (): Promise<TimedSendResult> => {
        const started = performance.now();
        const elapsed = () => Math.round(performance.now() - started);
        const sender  = senders[credentials.kind];
        if (!sender) {
          return {
            ok: false, retryable: false, statusCode: null, raw: null, durationMs: 0,
            error: `No sender for provider kind "${credentials.kind}"`,
          };
        }
        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
        try {
          const result = await sender(credentials, message, { fetch: fetchImpl, signal: controller.signal });
          return { ...result, durationMs: elapsed() };
        } catch (error) {
          // adapters shouldn't throw, but a bug in one must not kill the worker
          return {
            ok: false, retryable: true, statusCode: null, raw: null, durationMs: elapsed(),
            error: `Sender crashed: ${error instanceof Error ? error.message : String(error)}`,
          };
        } finally {
          clearTimeout(timer);
        }
      }),
  };
}
