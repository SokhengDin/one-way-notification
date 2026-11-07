import { Config, Context, Layer, Redacted } from "effect";

export type DatabaseConfig = {
  readonly host: string;
  readonly port: number;
  readonly name: string;
  readonly user: string;
  readonly pass: Redacted.Redacted<string>;
};

const databaseConfig: Config.Config<DatabaseConfig> = Config.all({
  host: Config.string("DB_HOST"),
  port: Config.int("DB_PORT"),
  name: Config.string("DB_NAME"),
  user: Config.string("DB_USER"),
  pass: Config.redacted("DB_PASS"),
});

export type AppConfig = {
  readonly db: DatabaseConfig;
  readonly appPort: number;
  readonly corsOrigins: ReadonlyArray<string>;
  // Absolute origin this API is reachable at from the outside world. Used to
  // build asset URLs embedded in emails, which must be absolute.
  readonly publicUrl: string;
};

const appPortConfig = Config.int("APP_PORT").pipe(Config.withDefault(3000));

const appConfig: Config.Config<AppConfig> = Config.all({
  db:          databaseConfig,
  appPort:     appPortConfig,
  corsOrigins: Config.string("CORS_ORIGINS").pipe(
    Config.map((value) => value.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0)),
    Config.withDefault(["http://localhost:3000"]),
  ),
  publicUrl:   Config.string("PUBLIC_URL").pipe(
    Config.orElse(() => appPortConfig.pipe(Config.map((port) => `http://localhost:${port}`))),
    Config.map((url) => url.replace(/\/+$/, "")),
  ),
});

export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()(
  "AppConfigService",
) {}

export const AppConfigLive = Layer.effect(AppConfigService, appConfig);
