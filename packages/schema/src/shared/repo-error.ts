import { Effect } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

export function stringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }
  const prop = (value as Record<string, unknown>)[key];
  return typeof prop === "string" ? prop : undefined;
}

export interface RepoErrorFields<Operation extends string> {
  readonly message: string;
  readonly operation: Operation;
  readonly sqlState?: string;
  readonly constraint?: string;
  readonly cause: unknown;
}

export function makeMapSqlError<Operation extends string, E>(
  buildError: (fields: RepoErrorFields<Operation>) => E,
  defaultMessage: string,
) {
  const toRepoError = (operation: Operation, error: SqlError): E => {
    const cause = error.reason.cause;
    const sqlState = stringProperty(cause, "code");
    const constraint = stringProperty(cause, "constraint");
    return buildError({
      message: defaultMessage,
      operation,
      ...(sqlState === undefined ? {} : { sqlState }),
      ...(constraint === undefined ? {} : { constraint }),
      cause: error,
    });
  };

  const mapSqlError = <A>(operation: Operation) =>
    (effect: Effect.Effect<A, SqlError>): Effect.Effect<A, E> =>
      effect.pipe(Effect.mapError((error) => toRepoError(operation, error)));

  return { toRepoError, mapSqlError };
}
