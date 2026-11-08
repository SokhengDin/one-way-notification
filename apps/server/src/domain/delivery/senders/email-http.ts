// HTTP email APIs: SendGrid, Mailgun, Postmark, Resend, Amazon SES.

import { signAwsRequest } from "./sigv4";
import {
  basicAuth,
  formatSender,
  httpFailure,
  networkFailure,
  readBody,
  str,
  type Sender,
} from "./types";

const firstError = (raw: Record<string, unknown> | null): string | undefined => {
  if (!raw) return undefined;
  // SendGrid: { errors: [{ message }] }
  const errors = raw.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((entry) => str((entry as Record<string, unknown>)?.message)).filter(Boolean).join("; ");
  }
  return str(raw.message) || str(raw.Message) || str(raw.error) || undefined;
};

// ---------- SendGrid ----------

export const sendgrid: Sender = async ({ config, secrets }, message, { fetch, signal }) => {
  const content = [
    ...(message.text ? [{ type: "text/plain", value: message.text }] : []),
    { type: "text/html", value: message.body },
  ];
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method:  "POST",
      signal,
      headers: { authorization: `Bearer ${secrets.api_key}`, "content-type": "application/json" },
      body:    JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from:             { email: str(config.from_email), ...(config.from_name ? { name: str(config.from_name) } : {}) },
        ...(config.reply_to ? { reply_to: { email: str(config.reply_to) } } : {}),
        subject:          message.subject ?? "",
        content,
        custom_args:      { delivery_id: message.idempotencyKey },
      }),
    });
    const raw = await readBody(response);
    if (!response.ok) return httpFailure(response, raw, firstError(raw));
    return { ok: true, statusCode: response.status, providerRefId: response.headers.get("x-message-id"), raw };
  } catch (error) {
    return networkFailure(error);
  }
};

// ---------- Mailgun ----------

export const mailgun: Sender = async ({ config, secrets }, message, { fetch, signal }) => {
  const host = config.region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
  const form = new FormData();
  form.set("from", formatSender(config));
  form.set("to", message.to);
  form.set("subject", message.subject ?? "");
  form.set("html", message.body);
  if (message.text) form.set("text", message.text);
  if (config.reply_to) form.set("h:Reply-To", str(config.reply_to));
  form.set("v:delivery_id", message.idempotencyKey);
  try {
    const response = await fetch(`https://${host}/v3/${encodeURIComponent(str(config.domain))}/messages`, {
      method:  "POST",
      signal,
      headers: { authorization: basicAuth("api", secrets.api_key ?? "") },
      body:    form,
    });
    const raw = await readBody(response);
    if (!response.ok) return httpFailure(response, raw, firstError(raw));
    return { ok: true, statusCode: response.status, providerRefId: str(raw?.id) || null, raw };
  } catch (error) {
    return networkFailure(error);
  }
};

// ---------- Postmark ----------

export const postmark: Sender = async ({ config, secrets }, message, { fetch, signal }) => {
  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method:  "POST",
      signal,
      headers: {
        accept:                    "application/json",
        "content-type":            "application/json",
        "x-postmark-server-token": secrets.server_token ?? "",
      },
      body: JSON.stringify({
        From:          formatSender(config),
        To:            message.to,
        Subject:       message.subject ?? "",
        HtmlBody:      message.body,
        ...(message.text ? { TextBody: message.text } : {}),
        ...(config.reply_to ? { ReplyTo: str(config.reply_to) } : {}),
        MessageStream: str(config.message_stream) || "outbound",
        Metadata:      { delivery_id: message.idempotencyKey },
      }),
    });
    const raw = await readBody(response);
    // Postmark reports some rejections with 200 + a non-zero ErrorCode
    const errorCode = Number(raw?.ErrorCode ?? 0);
    if (!response.ok || errorCode !== 0) return httpFailure(response, raw, firstError(raw));
    return { ok: true, statusCode: response.status, providerRefId: str(raw?.MessageID) || null, raw };
  } catch (error) {
    return networkFailure(error);
  }
};

// ---------- Resend ----------

export const resend: Sender = async ({ config, secrets }, message, { fetch, signal }) => {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      signal,
      headers: {
        authorization:     `Bearer ${secrets.api_key}`,
        "content-type":    "application/json",
        // Resend dedupes retries of the same delivery for 24 h
        "idempotency-key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from:    formatSender(config),
        to:      [message.to],
        subject: message.subject ?? "",
        html:    message.body,
        ...(message.text ? { text: message.text } : {}),
        ...(config.reply_to ? { reply_to: str(config.reply_to) } : {}),
      }),
    });
    const raw = await readBody(response);
    if (!response.ok) return httpFailure(response, raw, firstError(raw));
    return { ok: true, statusCode: response.status, providerRefId: str(raw?.id) || null, raw };
  } catch (error) {
    return networkFailure(error);
  }
};

// ---------- Amazon SES (v2) ----------

export const amazonSes: Sender = async ({ config, secrets }, message, { fetch, signal }) => {
  const region = str(config.region);
  const url    = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const body   = JSON.stringify({
    FromEmailAddress: formatSender(config),
    Destination:      { ToAddresses: [message.to] },
    ...(config.reply_to ? { ReplyToAddresses: [str(config.reply_to)] } : {}),
    Content: {
      Simple: {
        Subject: { Data: message.subject ?? "", Charset: "UTF-8" },
        Body:    {
          Html: { Data: message.body, Charset: "UTF-8" },
          ...(message.text ? { Text: { Data: message.text, Charset: "UTF-8" } } : {}),
        },
      },
    },
    ...(config.configuration_set ? { ConfigurationSetName: str(config.configuration_set) } : {}),
    EmailTags: [{ Name: "delivery_id", Value: message.idempotencyKey }],
  });
  const headers = signAwsRequest({
    method:          "POST",
    url,
    region,
    service:         "ses",
    body,
    headers:         { "content-type": "application/json" },
    accessKeyId:     str(config.access_key_id),
    secretAccessKey: secrets.secret_access_key ?? "",
  });
  try {
    const response = await fetch(url, { method: "POST", signal, headers, body });
    const raw      = await readBody(response);
    if (!response.ok) return httpFailure(response, raw, firstError(raw));
    return { ok: true, statusCode: response.status, providerRefId: str(raw?.MessageId) || null, raw };
  } catch (error) {
    return networkFailure(error);
  }
};
