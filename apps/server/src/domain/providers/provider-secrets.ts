// Encryption at rest for provider credentials.
//
// Format (one BYTEA): [version 1B][iv 12B][auth tag 16B][ciphertext]
// AES-256-GCM over the JSON of { field: value }. The provider id is bound as
// additional authenticated data, so a blob copied onto another provider row
// fails to decrypt instead of silently handing over someone else's keys.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION   = 1;
const IV_BYTES  = 12;
const TAG_BYTES = 16;

export type SecretValues = Readonly<Record<string, string>>;

/**
 * A 32-byte key from PROVIDER_SECRET_KEY. A base64 value that decodes to
 * exactly 32 bytes (`openssl rand -base64 32`) is used as-is; anything else
 * is treated as a passphrase and hashed to 32 bytes.
 */
export function deriveKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
    const raw = Buffer.from(trimmed, "base64");
    if (raw.length === 32) return raw;
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export function encryptSecrets(key: Buffer, providerId: string, values: SecretValues): Uint8Array {
  const iv     = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(providerId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
  return new Uint8Array(Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]));
}

/** null when the blob is malformed, from another key, or from another row. */
export function decryptSecrets(key: Buffer, providerId: string, blob: Uint8Array): SecretValues | null {
  const bytes = Buffer.from(blob);
  if (bytes.length < 1 + IV_BYTES + TAG_BYTES || bytes[0] !== VERSION) return null;

  const iv         = bytes.subarray(1, 1 + IV_BYTES);
  const tag        = bytes.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = bytes.subarray(1 + IV_BYTES + TAG_BYTES);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(providerId, "utf8"));
    decipher.setAuthTag(tag);
    const json   = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as SecretValues;
  } catch {
    return null;
  }
}
