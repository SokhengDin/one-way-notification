// SMTP through nodemailer: own mail server, Google Workspace, Microsoft 365…

import nodemailer from "nodemailer";
import { formatSender, str, type Sender } from "./types";

interface SmtpError {
  readonly code?:         string;
  readonly command?:      string;
  readonly responseCode?: number;
  readonly response?:     string;
  readonly message?:      string;
}

// Connection-level codes nodemailer uses for "couldn't talk to the server"
const TRANSIENT_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED"]);

export const smtp: Sender = async ({ config, secrets }, message, { signal }) => {
  const security  = str(config.security) || "starttls";
  const transport = nodemailer.createTransport({
    host:              str(config.host),
    port:              Number(config.port) || 587,
    secure:            security === "tls",
    requireTLS:        security === "starttls",
    ignoreTLS:         security === "none",
    auth:              config.username ? { user: str(config.username), pass: secrets.password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     20_000,
  });

  const abort = () => transport.close();
  signal.addEventListener("abort", abort, { once: true });

  try {
    const info = await transport.sendMail({
      from:      formatSender(config),
      to:        message.to,
      replyTo:   config.reply_to ? str(config.reply_to) : undefined,
      subject:   message.subject ?? "",
      html:      message.body,
      text:      message.text ?? undefined,
      headers:   { "X-Delivery-Id": message.idempotencyKey },
    });
    const rejected = (info.rejected ?? []).map(String);
    if (rejected.length > 0) {
      return {
        ok:         false,
        retryable:  false,
        statusCode: null,
        error:      `Recipient rejected: ${rejected.join(", ")}`,
        recipientError: true,
        raw:        { response: info.response, rejected },
      };
    }
    return {
      ok:            true,
      statusCode:    250,
      providerRefId: info.messageId ?? null,
      raw:           { response: info.response, accepted: (info.accepted ?? []).map(String) },
    };
  } catch (cause) {
    const error = cause as SmtpError;
    const code  = error.responseCode ?? null;
    // SMTP replies: 4xx = try again later, 5xx = permanent. No reply at all
    // means the connection failed, which is transient — except bad auth.
    const retryable = code !== null
      ? code >= 400 && code < 500
      : signal.aborted || (error.code !== undefined && TRANSIENT_CODES.has(error.code));
    const text = signal.aborted
      ? "Timed out waiting for the SMTP server"
      : (error.response ?? error.message ?? String(cause));
    return {
      ok:             false,
      retryable,
      // rejected at RCPT TO: about this address, not the server
      recipientError: error.command?.toUpperCase().startsWith("RCPT") ?? false,
      statusCode:     code,
      error:      (error.code === "EAUTH" ? `Authentication failed: ${text}` : text).slice(0, 1000),
      raw:        { code: error.code ?? null, response: error.response ?? null },
    };
  } finally {
    signal.removeEventListener("abort", abort);
    transport.close();
  }
};
