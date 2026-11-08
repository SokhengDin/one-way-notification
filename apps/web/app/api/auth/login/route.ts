import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE, cookieOptions, envelope, sameOrigin, seal } from "@/lib/server/session";

interface ApiLogin {
  readonly status:  number;
  readonly message: string;
  readonly data:    { token: string; expires_at: string; admin: { name: string; email: string } } | null;
}

/** Email + password → API session; its token is sealed into an HttpOnly cookie. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return envelope(403, "Cross-origin request refused");

  const body     = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email    = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password)   return envelope(400, "Email and password are required");
  if (password.length > 256) return envelope(400, "Invalid email or password");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/login`, {
      method:  "POST",
      headers: {
        "content-type":    "application/json",
        "user-agent":      req.headers.get("user-agent") ?? "one-way-notification-dashboard",
        "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "",
      },
      body:  JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return envelope(502, "Can't reach the notification API");
  }

  const env = (await res.json().catch(() => null)) as ApiLogin | null;
  if (!res.ok || !env?.data) {
    return envelope(res.status === 200 ? 502 : res.status, env?.message ?? "Sign-in failed");
  }

  const session = { token: env.data.token, name: env.data.admin.name, email: env.data.admin.email, issuedAt: Math.floor(Date.now() / 1000) };
  (await cookies()).set(SESSION_COOKIE, await seal(session), cookieOptions);
  return envelope(200, `Welcome, ${env.data.admin.name}`, { name: env.data.admin.name });
}
