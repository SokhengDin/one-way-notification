import { DEFAULT_STATS_DAYS, MAX_STATS_DAYS, StatsQueryInvalid } from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { makeSqlStatsRepo } from "./stats.sql";
import type { StatsRepoService as StatsRepoServiceShape, StatsService } from "./stats.types";

export class StatsRepo extends Context.Service<StatsRepo, StatsRepoServiceShape>()(
  "app/domain/stats/StatsRepo",
) {
  static readonly layer = Layer.effect(
    StatsRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlStatsRepo(sql);
    }),
  );
}

/** IANA zone known to the runtime (Postgres uses the same tz database). */
export function isValidTimezone(timezone: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export class Stats extends Context.Service<Stats, StatsService>()("app/domain/stats/Stats") {
  static readonly layer = Layer.effect(
    Stats,
    Effect.gen(function* () {
      const repo = yield* StatsRepo;

      const overview: StatsService["overview"] = Effect.fn("Stats.overview")(function* (query) {
        const days     = query.days ?? DEFAULT_STATS_DAYS;
        const timezone = query.timezone ?? "UTC";

        if (!Number.isInteger(days) || days < 1 || days > MAX_STATS_DAYS) {
          return yield* new StatsQueryInvalid({ message: `days must be a whole number from 1 to ${MAX_STATS_DAYS}` });
        }
        if (!isValidTimezone(timezone)) {
          return yield* new StatsQueryInvalid({ message: `timezone "${timezone}" is not a known IANA timezone` });
        }
        return yield* repo.overview({ days, timezone });
      });

      return { overview };
    }),
  ).pipe(Layer.provide(StatsRepo.layer));
}
