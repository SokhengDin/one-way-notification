import { Api, ok } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { Stats } from "./stats";

export const StatsApiHandlers = HttpApiBuilder.group(
  Api,
  "stats",
  Effect.fn(function* (handlers) {
    const stats = yield* Stats;

    return handlers.handle("getStatsOverview", ({ query }) =>
      stats.overview(query).pipe(Effect.map((data) => ok(data))),
    );
  }),
).pipe(Layer.provide(Stats.layer));
