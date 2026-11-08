// First run: with no administrator in the database, create one from
// ADMIN_EMAIL / ADMIN_PASSWORD (ADMIN_NAME optional). Does nothing once any
// admin exists, so the variables can stay set. Without them and without an
// admin, say how to create one (`bun run admin:create`).

import { Config, Effect, Layer, Option, Redacted } from "effect";
import { Auth } from "./auth";

export const AdminBootstrapLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const auth     = yield* Auth;
    const email    = yield* Config.option(Config.string("ADMIN_EMAIL"));
    const password = yield* Config.option(Config.redacted("ADMIN_PASSWORD"));
    const name     = yield* Config.string("ADMIN_NAME").pipe(Config.withDefault("Administrator"));

    if (Option.isSome(email) && Option.isSome(password) && Redacted.value(password.value).length > 0) {
      if (Redacted.value(password.value).length < 12) {
        return yield* Effect.logWarning("ADMIN_PASSWORD must be at least 12 characters; no administrator was created");
      }
      const created = yield* auth.bootstrapAdmin({
        email:    email.value,
        name,
        password: Redacted.value(password.value),
      });
      if (created) yield* Effect.logInfo(`Created administrator ${created.email} from ADMIN_EMAIL`);
      return;
    }

    if ((yield* auth.adminCount) === 0) {
      yield* Effect.logWarning(
        "No administrator yet: nobody can sign in to the dashboard. Set ADMIN_EMAIL and ADMIN_PASSWORD, or run `bun run admin:create`.",
      );
    }
  }).pipe(Effect.catch((error) => Effect.logError("Administrator bootstrap failed", error))),
);
