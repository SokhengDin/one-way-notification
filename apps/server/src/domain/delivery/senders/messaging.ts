// SMS (Twilio, Vonage) and Telegram.

import {
  basicAuth,
  httpFailure,
  networkFailure,
  readBody,
  str,
  type Sender,
} from "./types";

// ---------- Twilio ----------

export const twilio: Sender = async ({ config, secrets }, message, { fetch, signal }) => {
  const sid = str(config.account_sid);
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method:  "POST",
      signal,
      headers: {
        authorization:  basicAuth(sid, secrets.auth_token ?? ""),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: message.to, From: str(config.from_number), Body: message.body }),
    });
    const raw = await readBody(response);
    if (!response.ok) return httpFailure(response, raw, str(raw?.message) || undefined);
    return { ok: true, statusCode: response.status, providerRefId: str(raw?.sid) || null, raw };
  } catch (error) {
    return networkFailure(error);
  }
};

// ---------- Vonage ----------

export const vonage: Sender = async ({ config, secrets }, message, { fetch, signal }) => {
  try {
    const response = await fetch("https://rest.nexmo.com/sms/json", {
      method:  "POST",
      signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        api_key:    str(config.api_key),
        api_secret: secrets.api_secret ?? "",
        from:       str(config.from).replace(/^\+/, ""),
        to:         message.to.replace(/^\+/, ""),
        text:       message.body,
        "client-ref": message.idempotencyKey.slice(0, 40),
      }),
    });
    const raw = await readBody(response);
    if (!response.ok) return httpFailure(response, raw, undefined);

    // Vonage answers 200 and reports per-message status: "0" is success,
    // "1" is throttled (retry), everything else is a rejection.
    const first  = Array.isArray(raw?.messages) ? (raw!.messages[0] as Record<string, unknown>) : undefined;
    const status = str(first?.status);
    if (status === "0") {
      return { ok: true, statusCode: response.status, providerRefId: str(first?.["message-id"]) || null, raw };
    }
    return {
      ok:         false,
      retryable:  status === "1",
      statusCode: response.status,
      error:      str(first?.["error-text"]) || `Vonage status ${status || "unknown"}`,
      raw,
    };
  } catch (error) {
    return networkFailure(error);
  }
};

// ---------- Telegram ----------

export const telegramBot: Sender = async ({ config, secrets }, message, { fetch, signal }) => {
  const parseMode = str(config.parse_mode);
  try {
    const response = await fetch(`https://api.telegram.org/bot${secrets.bot_token}/sendMessage`, {
      method:  "POST",
      signal,
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        chat_id:                  message.to,
        text:                     message.body,
        ...(parseMode && parseMode !== "none" ? { parse_mode: parseMode } : {}),
        disable_web_page_preview: true,
      }),
    });
    const raw = await readBody(response);
    if (!response.ok || raw?.ok === false) {
      return httpFailure(response, raw, str(raw?.description) || undefined);
    }
    const result = raw?.result as Record<string, unknown> | undefined;
    return { ok: true, statusCode: response.status, providerRefId: str(result?.message_id) || null, raw };
  } catch (error) {
    return networkFailure(error);
  }
};
