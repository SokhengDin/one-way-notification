// What an API key looks like, and the only code that makes or reads one.
//
//   ownk_Ab12Cd34_<43 random chars><6 checksum chars>
//   └─┬─┘└──┬───┘ └──────────────┬──────────────────┘
//  marker  public id        secret + CRC32
//
// * 43 base62 characters drawn from the OS CSPRNG = 256 bits of entropy, so
//   guessing is hopeless and a plain SHA-256 is the right hash to store (a
//   slow password hash buys nothing for a key this strong, and would make
//   every request slow).
// * the public id is shown in the dashboard and logs to tell keys apart.
// * the CRC32 lets a typo or truncated key be rejected without touching the
//   database, and lets secret scanners recognise our keys.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const KEY_MARKER = "ownk_";

const ALPHABET   = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_LENGTH  = 8;
const SECRET_LEN = 43;
const CRC_LENGTH = 6;

const KEY_PATTERN = new RegExp(`^${KEY_MARKER}([0-9A-Za-z]{${ID_LENGTH}})_([0-9A-Za-z]{${SECRET_LEN + CRC_LENGTH}})$`);

/** Uniform base62 characters: bytes ≥ 248 are thrown away, so there is no modulo bias. */
function randomBase62(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += ALPHABET[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

function base62Fixed(value: number, width: number): string {
  let out = "";
  let rest = value >>> 0;
  for (let i = 0; i < width; i++) {
    out   = ALPHABET[rest % 62] + out;
    rest  = Math.floor(rest / 62);
  }
  return out;
}

const checksum = (body: string) => base62Fixed(Bun.hash.crc32(body), CRC_LENGTH);

export interface NewKey {
  /** the full key: shown once, never stored */
  readonly secret:    string;
  readonly prefix:    string;
  readonly last_four: string;
  readonly key_hash:  string;
}

export const hashApiKey = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");

export function generateApiKey(): NewKey {
  const id     = randomBase62(ID_LENGTH);
  const body   = `${KEY_MARKER}${id}_${randomBase62(SECRET_LEN)}`;
  const secret = `${body}${checksum(body)}`;
  return {
    secret,
    prefix:    `${KEY_MARKER}${id}`,
    last_four: secret.slice(-4),
    key_hash:  hashApiKey(secret),
  };
}

/**
 * Is this worth a database lookup? Keys in our format must carry a valid
 * checksum. Anything else might be a legacy key moved from the old
 * plaintext column, so it is looked up too, but only if it's a sane length.
 */
export function plausibleApiKey(key: string): boolean {
  if (key.length < 1 || key.length > 512) return false;
  if (!key.startsWith(KEY_MARKER)) return true; // legacy
  const match = KEY_PATTERN.exec(key);
  if (!match) return false;
  const body  = key.slice(0, -CRC_LENGTH);
  const given = Buffer.from(key.slice(-CRC_LENGTH));
  const want  = Buffer.from(checksum(body));
  return given.length === want.length && timingSafeEqual(given, want);
}
