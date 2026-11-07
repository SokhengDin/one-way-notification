import { Schema } from "effect";

export const StatsRepoOperation = Schema.Literals(["overview"]);
export type StatsRepoOperation = typeof StatsRepoOperation.Type;

export class StatsRepoError extends Schema.TaggedErrorClass<StatsRepoError>()(
  "StatsRepoError",
  {
    message:    Schema.String,
    operation:  StatsRepoOperation,
    sqlState:   Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause:      Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

// Bad `days` or `timezone`.
export class StatsQueryInvalid extends Schema.TaggedErrorClass<StatsQueryInvalid>()(
  "StatsQueryInvalid",
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 },
) {}
