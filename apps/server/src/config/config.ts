import { Config, Context, Layer, Option, Redacted } from "effect";

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

export type DeliveryConfig = {
  // run the background worker in this process
  readonly workerEnabled: boolean;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  // default attempt budget for new deliveries
  readonly maxAttempts: number;
  // per provider call
  readonly sendTimeoutMs: number;
  // how long a claimed delivery stays invisible to other workers; must
  // comfortably exceed sendTimeoutMs × number of providers
  readonly leaseSeconds: number;
};

const positiveInt = (name: string, fallback: number, max: number) =>
  Config.int(name).pipe(
    Config.withDefault(fallback),
    Config.map((value) => Math.min(Math.max(value, 1), max)),
  );

const deliveryConfig: Config.Config<DeliveryConfig> = Config.all({
  workerEnabled:  Config.boolean("DELIVERY_WORKER_ENABLED").pipe(Config.withDefault(true)),
  pollIntervalMs: positiveInt("DELIVERY_POLL_INTERVAL_MS", 1000, 60_000),
  batchSize:      positiveInt("DELIVERY_BATCH_SIZE", 20, 500),
  maxAttempts:    positiveInt("DELIVERY_MAX_ATTEMPTS", 5, 50),
  sendTimeoutMs:  positiveInt("DELIVERY_SEND_TIMEOUT_MS", 15_000, 120_000),
  leaseSeconds:   positiveInt("DELIVERY_LEASE_SECONDS", 120, 3600),
});

export type AppConfig = {
  readonly db: DatabaseConfig;
  readonly appPort: number;
  readonly corsOrigins: ReadonlyArray<string>;
  // Absolute origin this API is reachable at from the outside world. Used to
  // build asset URLs embedded in emails, which must be absolute.
  readonly publicUrl: string;
  // Encrypts provider credentials at rest. Optional so the API runs without
  // it, but saving a provider with credentials fails until it is set.
  readonly providerSecretKey: Option.Option<Redacted.Redacted<string>>;
  readonly delivery: DeliveryConfig;
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
  providerSecretKey: Config.redacted("PROVIDER_SECRET_KEY").pipe(
    Config.option,
    // a blank `PROVIDER_SECRET_KEY=` line means "not set", never an empty key
    Config.map(Option.filter((key) => Redacted.value(key).trim() !== "")),
  ),
  delivery: deliveryConfig,
});

export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()(
  "AppConfigService",
) {}

export const AppConfigLive = Layer.effect(AppConfigService, appConfig);
