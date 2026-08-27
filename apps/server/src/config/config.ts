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
};

const appConfig: Config.Config<AppConfig> = Config.all({
  db:          databaseConfig,
  appPort:     Config.int("APP_PORT").pipe(Config.withDefault(3000)),
  corsOrigins: Config.string("CORS_ORIGINS").pipe(
    Config.map((value) => value.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0)),
    Config.withDefault(["http://localhost:3000"]),
  ),
});

export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()(
  "AppConfigService",
) {}

export const AppConfigLive = Layer.effect(AppConfigService, appConfig);
