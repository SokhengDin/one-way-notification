import { Schema } from "effect";

export const PaginationQuery = {
  skip: Schema.optional(Schema.NumberFromString),
  limit: Schema.optional(Schema.NumberFromString),
};

export const PaginatedData = <S extends Schema.Top>(item: S) =>
  Schema.Struct({
    items: Schema.Array(item),
    total: Schema.Int,
    skip: Schema.Int,
    limit: Schema.Int,
  });

// ---------- server-side pagination helpers ----------

export interface PaginationInput {
  readonly skip?: number;
  readonly limit?: number;
}

export interface PaginatedResult<A> {
  readonly items: ReadonlyArray<A>;
  readonly total: number;
  readonly skip: number;
  readonly limit: number;
}

export const DEFAULT_SKIP = 0;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function normalizePagination(input: PaginationInput): {
  readonly skip: number;
  readonly limit: number;
} {
  return {
    skip: input.skip ?? DEFAULT_SKIP,
    limit: Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
  };
}
