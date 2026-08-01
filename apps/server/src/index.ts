import { Api } from "@repo/schema";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi";
import { HttpRouter } from "effect/unstable/http";
import { AppConfigLive, AppConfigService } from "./config/config";
import { PgLive } from "./pg";
import { UsersApiHandlers } from "./domain/users/users.http";
import { SystemApiHandlers } from "./system.http";

const ApiLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([UsersApiHandlers, SystemApiHandlers]),
  Layer.provide(PgLive),
);

const SwaggerLive = HttpApiSwagger.layer(Api, { path: "/docs" });

const AllRoutes = Layer.mergeAll(ApiLive, SwaggerLive);

const BunHttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    return BunHttpServer.layer({ port: config.appPort });
  }),
).pipe(Layer.provide(AppConfigLive));

const HttpServerLive = HttpRouter.serve(AllRoutes).pipe(
  Layer.provide(BunHttpServerLive),
);

BunRuntime.runMain(Layer.launch(HttpServerLive));
