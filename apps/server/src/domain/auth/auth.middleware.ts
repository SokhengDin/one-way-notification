// Every /api route needs a signed-in administrator (Authorization: Bearer
// <session token>), except:
//
//   GET  /api/health          liveness probe
//   POST /api/auth/login      how you get a token
//   GET  /api/asset/:id       brand images embedded in sent emails
//   POST /api/notification    when called with X-Api-Key: an external
//                             system sending. The handler checks the key
//                             belongs to the system in the payload.
//   /docs                     the OpenAPI description
//   OPTIONS                   CORS preflight

import { Effect, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { Auth } from "./auth";

export const bearerToken = (headers: Readonly<Record<string, string | undefined>>): string | null => {
  const header = headers["authorization"] ?? "";
  const match  = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1]! : null;
};

export function isPublicRoute(method: string, path: string, headers: Readonly<Record<string, string | undefined>>): boolean {
  if (method === "OPTIONS") return true;
  if (!path.startsWith("/api/")) return true; // /docs and anything outside the API
  if (path === "/api/health") return true;
  if (method === "POST" && path === "/api/auth/login") return true;
  if ((method === "GET" || method === "HEAD") && /^\/api\/asset\/[^/]+$/.test(path)) return true;
  if (method === "POST" && path === "/api/notification" && headers["x-api-key"]) return true;
  return false;
}

const unauthorized = (message: string) =>
  HttpServerResponse.jsonUnsafe(
    { status: 401, message, data: null, _tag: "Unauthorized" },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="one-way-notification"' } },
  );

export const AuthMiddlewareLive = HttpRouter.middleware(
  Effect.gen(function* () {
    const auth = yield* Auth;

    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const path    = new URL(request.url, "http://local").pathname;
        const headers = request.headers as Readonly<Record<string, string | undefined>>;

        if (isPublicRoute(request.method, path, headers)) return yield* httpEffect;

        const token = bearerToken(headers);
        if (token === null) return unauthorized("Sign in to use this API");

        const admin = yield* auth.authenticate(token).pipe(
          Effect.map(Option.fromNullishOr),
          Effect.catch((error) =>
            Effect.logError("Could not check the session", error).pipe(Effect.as(Option.none())),
          ),
        );
        if (Option.isNone(admin)) return unauthorized("Your session has expired. Sign in again.");

        return yield* httpEffect;
      });
  }),
  { global: true },
);
