// The application's layer graph. `index.ts` launches it on a Bun server;
// tests mount the same `AppRoutes` in-process via `HttpRouter.toWebHandler`,
// so there is exactly one copy of this wiring.
import { Api } from "@repo/schema";
import { Layer } from "effect";
import { HttpMiddleware } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi";
import { PgLive } from "./pg";
import { UsersApiHandlers } from "./domain/users/users.http";
import { NotificationsApiHandlers } from "./domain/notifications/notifications.http";
import { ExternalSystemsApiHandlers } from "./domain/external-systems/external-systems.http";
import { ProvidersApiHandlers } from "./domain/providers/providers.http";
import { AssetsApiHandlers } from "./domain/assets/assets.http";
import { SystemApiHandlers } from "./domain/system/system.http";

const ApiLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([
    UsersApiHandlers,
    NotificationsApiHandlers,
    ExternalSystemsApiHandlers,
    ProvidersApiHandlers,
    AssetsApiHandlers,
    SystemApiHandlers,
  ]),
  Layer.provide(PgLive),
);

const SwaggerLive = HttpApiSwagger.layer(Api, { path: "/docs" });

export const AppRoutes = Layer.mergeAll(ApiLive, SwaggerLive);

export const corsMiddleware = (allowedOrigins: ReadonlyArray<string>) =>
  HttpMiddleware.cors({
    allowedOrigins,
    allowedMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });
