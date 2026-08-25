import { Api, ok } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Providers } from "./providers";

export const ProvidersApiHandlers = HttpApiBuilder.group(
  Api,
  "providers",
  Effect.fn(function* (handlers) {
    const providers = yield* Providers;

    return handlers
      // ---------- channel_providers ----------
      .handle("listChannelProviders", ({ query }) =>
        providers
          .listChannelProviders(query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("addChannelProvider", ({ payload }) =>
        providers
          .addChannelProvider(payload)
          .pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("getChannelProviderById", ({ params }) =>
        providers
          .getChannelProviderById(params.id)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("updateChannelProvider", ({ params, payload }) =>
        providers
          .updateChannelProvider(params.id, payload)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("deleteChannelProvider", ({ params }) =>
        providers.deleteChannelProvider(params.id),
      )
      // ---------- provider_usage_log ----------
      .handle("listProviderUsageLogByDelivery", ({ params, query }) =>
        providers
          .listProviderUsageLogByDelivery(params.deliveryId, query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("addProviderUsageLog", ({ payload }) =>
        providers
          .addProviderUsageLog(payload)
          .pipe(Effect.map((data) => ok(data, 201, "Created"))),
      );
  }),
).pipe(Layer.provide(Providers.layer));
