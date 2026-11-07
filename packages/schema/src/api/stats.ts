import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { StatsOverview } from "../stats/stats";
import { StatsQueryInvalid, StatsRepoError } from "../stats/stats.errors";
import { ApiResponse } from "./response";

export class StatsApiGroup extends HttpApiGroup.make("stats")
  .add(
    HttpApiEndpoint.get("getStatsOverview", "/stats/overview", {
      query: {
        // last N calendar days including today (1-365, default 30)
        days:     Schema.optional(Schema.NumberFromString),
        // IANA zone the days are counted in (default UTC)
        timezone: Schema.optional(Schema.String),
      },
      success: ApiResponse(StatsOverview),
      error:   [StatsQueryInvalid, StatsRepoError],
    }),
  )
  .prefix("/api")
{}
