import { Api } from "@repo/schema";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof Api>
>()("web/ApiClient") {
  static readonly layer = Layer.effect(
    ApiClient,
    HttpApiClient.make(Api, { baseUrl: API_BASE_URL }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}

const runtime = ManagedRuntime.make(ApiClient.layer);

export const runApi = <A, E>(
  f: (client: HttpApiClient.ForApi<typeof Api>) => Effect.Effect<A, E>,
): Promise<A> => runtime.runPromise(ApiClient.use(f));
