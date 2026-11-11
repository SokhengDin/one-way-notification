import { Api, ok, Unauthorized } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Auth } from "../auth/auth";
import { bearerToken } from "../auth/auth.middleware";
import { ApiKeys } from "./api-keys";

export const ApiKeysApiHandlers = HttpApiBuilder.group(
  Api,
  "api-keys",
  Effect.fn(function* (handlers) {
    const apiKeys = yield* ApiKeys;
    const auth    = yield* Auth;

    // The middleware has already checked the session; this says who it is,
    // so issued and revoked keys record the administrator.
    const currentAdminId = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const token   = bearerToken(request.headers as Readonly<Record<string, string | undefined>>);
      const admin   = token
        ? yield* auth.authenticate(token).pipe(Effect.catch(() => Effect.succeed(null)))
        : null;
      if (!admin) return yield* new Unauthorized({ message: "Sign in to manage API keys" });
      return admin.id;
    });

    return handlers
      .handle("listApiKeys", ({ params, query }) =>
        apiKeys
          .listApiKeys(params.externalSystemId, query.include_inactive === "true")
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("issueApiKey", ({ params, payload }) =>
        Effect.gen(function* () {
          const adminId = yield* currentAdminId;
          const issued  = yield* apiKeys.issueApiKey(params.externalSystemId, payload, adminId);
          return ok(issued, 201, "API key issued. Copy it now: it won't be shown again.");
        }),
      )
      .handle("revokeApiKey", ({ params }) =>
        Effect.gen(function* () {
          const adminId = yield* currentAdminId;
          return ok(yield* apiKeys.revokeApiKey(params.id, adminId), 200, "API key revoked");
        }),
      )
      .handle("rollApiKey", ({ params, payload }) =>
        Effect.gen(function* () {
          const adminId = yield* currentAdminId;
          const issued  = yield* apiKeys.rollApiKey(params.id, payload, adminId);
          return ok(issued, 201, "API key rolled. Copy the new key now: it won't be shown again.");
        }),
      );
  }),
).pipe(Layer.provide([ApiKeys.layer, Auth.layer]));
