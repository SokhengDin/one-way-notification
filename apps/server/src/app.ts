// The application's layer graph. `index.ts` launches it on a Bun server;
// tests mount the same `AppRoutes` in-process via `HttpRouter.toWebHandler`,
// so there is exactly one copy of this wiring.
import { Api } from "@repo/schema";
import { Config, Layer } from "effect";
import { HttpMiddleware } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi";
import { PgLive } from "./pg";
import { UsersApiHandlers } from "./domain/users/users.http";
import { NotificationsApiHandlers } from "./domain/notifications/notifications.http";
import { ExternalSystemsApiHandlers } from "./domain/external-systems/external-systems.http";
import { ProvidersApiHandlers } from "./domain/providers/providers.http";
import { AssetsApiHandlers } from "./domain/assets/assets.http";
import { SystemApiHandlers } from "./domain/system/system.http";
import { StatsApiHandlers } from "./domain/stats/stats.http";
import { DeliveriesApiHandlers } from "./domain/delivery/delivery.http";
import { DeliveryWorkerLive } from "./domain/delivery/delivery.worker";
import { SenderRegistry } from "./domain/delivery/senders";
import { AuthApiHandlers } from "./domain/auth/auth.http";
import { AuthMiddlewareLive } from "./domain/auth/auth.middleware";
import { Auth } from "./domain/auth/auth";
import { AdminBootstrapLive } from "./domain/auth/auth.bootstrap";
import { FileStore } from "./storage/file-store";

const SwaggerLive = HttpApiSwagger.layer(Api, { path: "/docs" });

/**
 * The routes, with the two ways the app touches the outside world plugged
 * in: how messages leave the building (real provider adapters in
 * production, a scripted fake in tests) and where files are kept (file-vault
 * in production, in memory in tests).
 */
export const makeAppRoutes = (
  senders: Layer.Layer<SenderRegistry>,
  files:   Layer.Layer<FileStore, Config.ConfigError> = FileStore.fileVault,
) => {
  const ApiLive = HttpApiBuilder.layer(Api).pipe(
    Layer.provide([
      UsersApiHandlers,
      NotificationsApiHandlers,
      ExternalSystemsApiHandlers,
      ProvidersApiHandlers,
      AssetsApiHandlers,
      StatsApiHandlers,
      DeliveriesApiHandlers,
      AuthApiHandlers,
      SystemApiHandlers,
    ]),
    Layer.provide(senders),
    Layer.provide(files),
    Layer.provide(PgLive),
  );
  const AuthLive = AuthMiddlewareLive.pipe(Layer.provide(Auth.layer), Layer.provide(PgLive));
  return Layer.mergeAll(ApiLive, SwaggerLive, AuthLive);
};

export const AppRoutes = makeAppRoutes(SenderRegistry.live);

/** Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD. */
export const AdminBootstrap = AdminBootstrapLive.pipe(Layer.provide(Auth.layer), Layer.provide(PgLive));

/** The background delivery worker (not started by tests). */
export const WorkerLive = DeliveryWorkerLive.pipe(
  Layer.provide(SenderRegistry.live),
  Layer.provide(PgLive),
);

export const corsMiddleware = (allowedOrigins: ReadonlyArray<string>) =>
  HttpMiddleware.cors({
    allowedOrigins,
    allowedMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });
