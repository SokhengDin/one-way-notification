// Server-only: the admin's session lives in an HttpOnly cookie.
//
// The API's session token (own_ prefix) never reaches browser JavaScript: it
// is sealed with AES-256-GCM (key = SHA-256 of SESSION_SECRET) into an
// HttpOnly, SameSite=Strict cookie, and attached to API calls by the
// /api/proxy route. Web Crypto only, so it runs in proxy.ts and route
// handlers alike.

export const SESSION_COOKIE = "own_session";
export const SESSION_TTL_S  = 12 * 60 * 60; // the API's session lifetime

/** The API's base URL, server-side only (never NEXT_PUBLIC_*). */
export const API_URL = (process.env.NOTIFY_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export interface Session {
  readonly token:    string; // API session token
  readonly name:     string; // for the sidebar, no extra request
  readonly email:    string;
  readonly issuedAt: number; // epoch seconds
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (at least 32 characters) in production");
  }
  return "dev-only-insecure-session-secret-change-me!!";
}

let cachedKey: Promise<CryptoKey> | null = null;
function aesKey(): Promise<CryptoKey> {
  cachedKey ??= crypto.subtle
    .digest("SHA-256", enc.encode(secret()))
    .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
  return cachedKey;
}

const b64u = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};

export async function seal(session: Session): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc.encode(JSON.stringify(session))));
  return `${b64u.encode(iv)}.${b64u.encode(ct)}`;
}

/** The session, or null when missing, tampered with or expired. */
export async function unseal(value: string | undefined | null): Promise<Session | null> {
  if (!value) return null;
  try {
    const [iv, ct] = value.split(".");
    if (!iv || !ct) return null;
    const plain   = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u.decode(iv) }, await aesKey(), b64u.decode(ct));
    const session = JSON.parse(dec.decode(plain)) as Session;
    if (typeof session.token !== "string" || Date.now() / 1000 - session.issuedAt > SESSION_TTL_S) return null;
    return session;
  } catch {
    return null;
  }
}

// Secure (HTTPS-only) in production. COOKIE_SECURE=false allows a plain-HTTP
// deployment such as http://<server-ip>:3001, where the browser would
// otherwise drop the cookie and every login would bounce back to /login.
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === undefined
    ? process.env.NODE_ENV === "production"
    : process.env.COOKIE_SECURE !== "false";

export const cookieOptions = {
  httpOnly: true,
  secure:   COOKIE_SECURE,
  sameSite: "strict" as const,
  path:     "/",
  maxAge:   SESSION_TTL_S,
};

export const API_HEADERS = {
  "Cache-Control":          "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options":        "DENY",
  "Referrer-Policy":        "no-referrer",
};

/** Same envelope as the API. */
export function envelope<T>(status: number, message: string, data: T | null = null): Response {
  return Response.json({ status, message, data }, { status, headers: API_HEADERS });
}

/** Same-origin check for state-changing requests (on top of SameSite=Strict). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.method === "GET" || req.method === "HEAD";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
