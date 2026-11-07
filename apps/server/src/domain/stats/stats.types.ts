import type { Effect } from "effect";
import type { StatsOverview, StatsQueryInvalid, StatsRepoError } from "@repo/schema";

export interface StatsQuery {
  readonly days:     number;
  readonly timezone: string;
}

export interface StatsRepoService {
  /** Assumes a validated query (whole days in range, known timezone). */
  readonly overview: (query: StatsQuery) => Effect.Effect<StatsOverview, StatsRepoError>;
}

export interface StatsService {
  readonly overview: (query: {
    readonly days?:     number;
    readonly timezone?: string;
  }) => Effect.Effect<StatsOverview, StatsQueryInvalid | StatsRepoError>;
}
