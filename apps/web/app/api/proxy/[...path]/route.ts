// Same-origin API proxy: browser → /api/proxy/api/... → notification API.
//
// * the session token comes from the sealed HttpOnly cookie, attached here
// * only /api/* paths are reachable; the browser's own auth headers are dropped
// * state-changing requests must be same-origin
// * a 401 from the API (session revoked or expired) ends the dashboard session

import { cookies } from "next/headers";
import { API_HEADERS, API_URL, SESSION_COOKIE, envelope, sameOrigin, unseal } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const FORWARD_REQUEST  = ["content-type", "accept", "user-agent", "x-forwarded-for"];
const FORWARD_RESPONSE = ["content-type", "content-length", "content-disposition", "cache-control", "etag", "last-modified"];

async function handle(req: Request, ctx: { params: Promise<{ path: Array<string> }> }) {
  const { path } = await ctx.params;
  if (path[0] !== "api" || path.some((part) => part === ".." || part === ".")) {
    return envelope(404, "Not Found");
  }
  if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) {
    return envelope(403, "Cross-origin request refused");
  }

  const jar     = await cookies();
  const session = await unseal(jar.get(SESSION_COOKIE)?.value);
  if (!session) return envelope(401, "Your session has expired. Sign in again.");

  const url    = new URL(req.url);
  const target = `${API_URL}/${path.map(encodeURIComponent).join("/")}${url.search}`;

  const headers = new Headers({ authorization: `Bearer ${session.token}` });
  for (const name of FORWARD_REQUEST) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method:   req.method,
      headers,
      body:     hasBody ? await req.arrayBuffer() : undefined,
      signal:   req.signal,
      cache:    "no-store",
      redirect: "manual",
    });
  } catch (error) {
    // the browser gave up (navigated away, a newer preview replaced this one)
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("[proxy] API request failed", req.method, path.join("/"), error);
    return envelope(502, "Can't reach the notification API");
  }

  const out = new Headers(API_HEADERS);
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  if (upstream.status === 401) jar.delete(SESSION_COOKIE);
  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD };
