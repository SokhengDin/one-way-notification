import { PgClient } from "@effect/sql-pg";
import { Effect, Layer } from "effect";
import { AppConfigLive, AppConfigService } from "./config/config";

export const PgLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    return PgClient.layer({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      username: config.db.user,
      password: config.db.pass,
      maxConnections: config.db.poolMax,
    });
  }),
).pipe(Layer.provide(AppConfigLive));
