// The catalog of provider integrations a channel can be configured with.
// One definition drives both sides: the server validates submitted config
// against it, and the dashboard renders each provider's form from it.
//
// Pure TypeScript, no Effect, so it is safe to import anywhere.

import type { ChannelType } from "../enums";

export type ProviderFieldType = "text" | "email" | "password" | "number" | "select" | "phone";

export interface ProviderField {
  readonly key:          string;
  readonly label:        string;
  readonly type:         ProviderFieldType;
  readonly required:     boolean;
  /** Stored encrypted, never returned by the API. */
  readonly secret?:      boolean;
  readonly placeholder?: string;
  readonly hint?:        string;
  readonly options?:     ReadonlyArray<string>;
  readonly default?:     string | number;
  readonly min?:         number;
  readonly max?:         number;
}

export interface ProviderKindSpec {
  readonly kind:        string;
  readonly channel:     ChannelType;
  readonly label:       string;
  readonly description: string;
  readonly fields:      ReadonlyArray<ProviderField>;
}

// ---------- shared field groups ----------

const SENDER_FIELDS: ReadonlyArray<ProviderField> = [
  {
    key:         "from_email",
    label:       "From email",
    type:        "email",
    required:    true,
    placeholder: "notifications@yourdomain.com",
    hint:        "Must be on a domain verified with this provider.",
  },
  { key: "from_name", label: "From name", type: "text",  required: false, placeholder: "Acme" },
  { key: "reply_to",  label: "Reply-to",  type: "email", required: false, placeholder: "support@yourdomain.com" },
];

// ---------- catalog ----------

export const PROVIDER_KINDS: ReadonlyArray<ProviderKindSpec> = [
  // email
  {
    kind:        "smtp",
    channel:     "email",
    label:       "Own domain (SMTP)",
    description: "Send through any SMTP server — your own mail server, Google Workspace, Microsoft 365, Zoho, or a relay.",
    fields: [
      { key: "host",     label: "SMTP host", type: "text",   required: true, placeholder: "smtp.yourdomain.com" },
      { key: "port",     label: "Port",      type: "number", required: true, default: 587, min: 1, max: 65535 },
      {
        key:      "security",
        label:    "Security",
        type:     "select",
        required: true,
        options:  ["starttls", "tls", "none"],
        default:  "starttls",
        hint:     "STARTTLS on 587, implicit TLS on 465. Avoid none outside local testing.",
      },
      { key: "username", label: "Username", type: "text",     required: false, placeholder: "notifications@yourdomain.com" },
      { key: "password", label: "Password", type: "password", required: false, secret: true },
      ...SENDER_FIELDS,
    ],
  },
  {
    kind:        "sendgrid",
    channel:     "email",
    label:       "SendGrid",
    description: "Twilio SendGrid Web API v3.",
    fields: [
      { key: "api_key", label: "API key", type: "password", required: true, secret: true, placeholder: "SG.…" },
      ...SENDER_FIELDS,
    ],
  },
  {
    kind:        "mailgun",
    channel:     "email",
    label:       "Mailgun",
    description: "Mailgun Messages API.",
    fields: [
      { key: "domain",  label: "Sending domain", type: "text",     required: true, placeholder: "mg.yourdomain.com" },
      { key: "region",  label: "Region",         type: "select",   required: true, options: ["us", "eu"], default: "us" },
      { key: "api_key", label: "API key",        type: "password", required: true, secret: true },
      ...SENDER_FIELDS,
    ],
  },
  {
    kind:        "amazon_ses",
    channel:     "email",
    label:       "Amazon SES",
    description: "Amazon Simple Email Service (v2 API).",
    fields: [
      { key: "region",            label: "Region",            type: "text",     required: true, placeholder: "eu-west-3" },
      { key: "access_key_id",     label: "Access key ID",     type: "text",     required: true, placeholder: "AKIA…" },
      { key: "secret_access_key", label: "Secret access key", type: "password", required: true, secret: true },
      { key: "configuration_set", label: "Configuration set", type: "text",     required: false },
      ...SENDER_FIELDS,
    ],
  },
  {
    kind:        "postmark",
    channel:     "email",
    label:       "Postmark",
    description: "Postmark transactional email.",
    fields: [
      { key: "server_token",   label: "Server token",   type: "password", required: true, secret: true },
      { key: "message_stream", label: "Message stream", type: "text",     required: true, default: "outbound" },
      ...SENDER_FIELDS,
    ],
  },
  {
    kind:        "resend",
    channel:     "email",
    label:       "Resend",
    description: "Resend email API.",
    fields: [
      { key: "api_key", label: "API key", type: "password", required: true, secret: true, placeholder: "re_…" },
      ...SENDER_FIELDS,
    ],
  },

  // sms
  {
    kind:        "twilio",
    channel:     "sms",
    label:       "Twilio",
    description: "Twilio Programmable Messaging.",
    fields: [
      { key: "account_sid", label: "Account SID", type: "text",     required: true, placeholder: "AC…" },
      { key: "auth_token",  label: "Auth token",  type: "password", required: true, secret: true },
      { key: "from_number", label: "From number", type: "phone",    required: true, placeholder: "+33612345678", hint: "E.164 format." },
    ],
  },
  {
    kind:        "vonage",
    channel:     "sms",
    label:       "Vonage",
    description: "Vonage (Nexmo) SMS API.",
    fields: [
      { key: "api_key",    label: "API key",    type: "text",     required: true },
      { key: "api_secret", label: "API secret", type: "password", required: true, secret: true },
      { key: "from",       label: "Sender",     type: "text",     required: true, placeholder: "Acme or +33612345678", hint: "Alphanumeric sender ID (max 11) or E.164 number." },
    ],
  },

  // telegram
  {
    kind:        "telegram_bot",
    channel:     "telegram",
    label:       "Telegram bot",
    description: "Telegram Bot API. Create the bot with @BotFather.",
    fields: [
      { key: "bot_token",  label: "Bot token",  type: "password", required: true, secret: true, placeholder: "123456:ABC-…" },
      { key: "parse_mode", label: "Parse mode", type: "select",   required: true, options: ["HTML", "MarkdownV2", "none"], default: "HTML" },
    ],
  },
];

export const PROVIDER_KIND_IDS = PROVIDER_KINDS.map((spec) => spec.kind) as ReadonlyArray<string>;

export function providerKindSpec(kind: string): ProviderKindSpec | undefined {
  return PROVIDER_KINDS.find((spec) => spec.kind === kind);
}

export function providerKindsFor(channel: ChannelType): ReadonlyArray<ProviderKindSpec> {
  return PROVIDER_KINDS.filter((spec) => spec.channel === channel);
}

// ---------- validation ----------

export type ProviderConfigValue = string | number;

const EMAIL    = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const E164     = /^\+[1-9]\d{6,14}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const ALNUM_SENDER = /^[A-Za-z0-9 ]{1,11}$/;

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/**
 * Validate a provider's non-secret config plus which secrets will be set.
 * Returns human-readable problems, prefixed with the field key; empty = valid.
 */
export function validateProviderConfig(
  spec:       ProviderKindSpec,
  config:     Readonly<Record<string, unknown>>,
  secretKeys: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const problems: Array<string> = [];
  const known    = new Set(spec.fields.map((field) => field.key));

  for (const key of Object.keys(config)) {
    const field = spec.fields.find((candidate) => candidate.key === key);
    if (!known.has(key)) {
      problems.push(`${key}: not a setting of ${spec.label}`);
    } else if (field?.secret) {
      problems.push(`${key}: is a secret — send it in "secrets", not "config"`);
    }
  }
  for (const key of secretKeys) {
    const field = spec.fields.find((candidate) => candidate.key === key);
    if (!field) problems.push(`${key}: not a setting of ${spec.label}`);
    else if (!field.secret) problems.push(`${key}: is not a secret — send it in "config"`);
  }

  for (const field of spec.fields) {
    if (field.secret) {
      if (field.required && !secretKeys.includes(field.key)) {
        problems.push(`${field.key}: is required`);
      }
      continue;
    }

    const value = config[field.key];
    if (isBlank(value)) {
      if (field.required) problems.push(`${field.key}: is required`);
      continue;
    }

    switch (field.type) {
      case "number": {
        if (typeof value !== "number" || !Number.isInteger(value)) {
          problems.push(`${field.key}: must be a whole number`);
        } else if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
          problems.push(`${field.key}: must be between ${field.min} and ${field.max}`);
        }
        break;
      }
      case "email":
        if (typeof value !== "string" || !EMAIL.test(value.trim())) problems.push(`${field.key}: must be an email address`);
        break;
      case "phone":
        if (typeof value !== "string" || !E164.test(value.trim())) problems.push(`${field.key}: must be in E.164 format, e.g. +33612345678`);
        break;
      case "select":
        if (typeof value !== "string" || !field.options?.includes(value)) {
          problems.push(`${field.key}: must be one of ${field.options?.join(", ")}`);
        }
        break;
      default:
        if (typeof value !== "string") problems.push(`${field.key}: must be text`);
    }
  }

  // kind-specific rules
  const text = (key: string) => (typeof config[key] === "string" ? (config[key] as string).trim() : "");

  if ((spec.kind === "smtp" || spec.kind === "mailgun") && text(spec.kind === "smtp" ? "host" : "domain")) {
    const key = spec.kind === "smtp" ? "host" : "domain";
    if (!HOSTNAME.test(text(key))) problems.push(`${key}: must be a hostname like smtp.yourdomain.com`);
  }
  if (spec.kind === "smtp") {
    const hasUser     = text("username") !== "";
    const hasPassword = secretKeys.includes("password");
    if (hasUser !== hasPassword) problems.push("password: username and password go together — set both or neither");
  }
  if (spec.kind === "vonage" && text("from") && !E164.test(text("from")) && !ALNUM_SENDER.test(text("from"))) {
    problems.push("from: must be an E.164 number or an alphanumeric sender ID of up to 11 characters");
  }

  return problems;
}

/** Domain part of the configured sender, for DNS guidance. */
export function senderDomain(config: Readonly<Record<string, unknown>>): string | null {
  const email = typeof config.from_email === "string" ? config.from_email : "";
  const at    = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).toLowerCase() : null;
}
