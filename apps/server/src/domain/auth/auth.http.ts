import { Api, ok, Unauthorized } from "@repo/schema";
import { Effect, Layer, Option } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Auth } from "./auth";
import { bearerToken } from "./auth.middleware";

export const AuthApiHandlers = HttpApiBuilder.group(
  Api,
  "auth",
  Effect.fn(function* (handlers) {
    const auth = yield* Auth;

    return handlers
      .handle("login", ({ payload }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const headers = request.headers as Readonly<Record<string, string | undefined>>;
          // the dashboard forwards the browser's address; otherwise the socket's
          const ip = headers["x-forwarded-for"]?.split(",")[0]?.trim() || Option.getOrNull(request.remoteAddress);
          const result = yield* auth.login({
            email:      payload.email,
            password:   payload.password,
            user_agent: headers["user-agent"] ?? null,
            ip:         ip ?? null,
          });
          return ok(result, 200, `Welcome, ${result.admin.name}`);
        }),
      )
      .handle("logout", () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const token   = bearerToken(request.headers as Readonly<Record<string, string | undefined>>);
          if (token) yield* auth.logout(token);
        }),
      )
      .handle("me", () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const token   = bearerToken(request.headers as Readonly<Record<string, string | undefined>>);
          const admin   = token ? yield* auth.authenticate(token) : null;
          if (!admin) return yield* new Unauthorized({ message: "Not signed in" });
          return ok(admin);
        }),
      );
  }),
).pipe(Layer.provide(Auth.layer));
