import { Api } from "@repo/schema";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

// Every call goes to this app's own /api/proxy, which attaches the signed-in
// admin's session (kept in an HttpOnly cookie) and forwards to the API.
// The browser never talks to the API directly and never sees the token.
export const PROXY_PATH = "/api/proxy";

const origin = () => (typeof window === "undefined" ? "http://localhost" : window.location.origin);

export class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof Api>
>()("web/ApiClient") {
  static readonly layer = Layer.effect(
    ApiClient,
    Effect.suspend(() => HttpApiClient.make(Api, { baseUrl: `${origin()}${PROXY_PATH}` })),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}

const runtime = ManagedRuntime.make(ApiClient.layer);

/** Did the API (or the proxy) answer 401: no session, or it ended? */
export function isUnauthorized(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  if (record._tag === "Unauthorized") return true;
  const status =
    (record.response as { status?: number } | undefined)?.status ??
    ((record.reason as { response?: { status?: number } } | undefined)?.response?.status);
  return status === 401;
}

let redirecting = false;

/** Send the browser to sign in, back to this page afterwards. */
export function redirectToLogin() {
  if (typeof window === "undefined" || redirecting) return;
  redirecting = true;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?expired=1&next=${encodeURIComponent(next)}`);
}

export const runApi = <A, E>(
  f: (client: HttpApiClient.ForApi<typeof Api>) => Effect.Effect<A, E>,
): Promise<A> =>
  runtime
    .runPromise(
      Effect.gen(function* () {
        const client = yield* ApiClient;
        return yield* f(client);
      }),
    )
    .catch((error: unknown) => {
      if (isUnauthorized(error)) redirectToLogin();
      throw error;
    });
