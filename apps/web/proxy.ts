// Next.js proxy (formerly middleware): runs before every page request.
//
//   1. no valid session        → any page redirects to /login?next=<path>
//   2. valid session + /login  → redirects to the overview (or ?next=)
//   3. every page response     → security headers
//
// /api/* isn't matched: those route handlers check the session themselves.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, unseal } from "@/lib/server/session";

const PUBLIC_PAGES = new Set(["/login"]);

function securityHeaders(res: NextResponse): NextResponse {
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // email previews show brand images from the API's public origin
    "img-src 'self' data: blob: http: https:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!dev) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return res;
}

const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session  = await unseal(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PAGES.has(pathname);

  if (!session && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    const res = NextResponse.redirect(url);
    if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE); // expired or tampered
    return securityHeaders(res);
  }

  if (session && isPublic) {
    return securityHeaders(NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url)));
  }

  return securityHeaders(NextResponse.next());
}

export const config = {
  // public: framework assets, icons, manifest, robots.txt, security.txt
  matcher: ["/((?!api/|_next/static|_next/image|\\.well-known/|icons/|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt).*)"],
};
