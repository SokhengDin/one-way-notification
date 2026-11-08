import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE, envelope, sameOrigin, unseal } from "@/lib/server/session";

/** End the API session (best effort), then drop the cookie. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return envelope(403, "Cross-origin request refused");

  const jar     = await cookies();
  const session = await unseal(jar.get(SESSION_COOKIE)?.value);
  if (session) {
    await fetch(`${API_URL}/api/auth/logout`, {
      method:  "POST",
      headers: { authorization: `Bearer ${session.token}` },
      cache:   "no-store",
    }).catch(() => null);
  }
  jar.delete(SESSION_COOKIE);
  return envelope(200, "Signed out");
}
