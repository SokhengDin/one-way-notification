import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Logger } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { AppRoutes, corsMiddleware } from "./app";
import { AppConfigLive, AppConfigService } from "./config/config";

const LoggerLive = Logger.layer([
  Logger.consolePretty({
    colors: true,
    mode: "tty",
    formatDate: (date) => date.toLocaleTimeString(),
  }),
]);

const BunHttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    return BunHttpServer.layer({ port: config.appPort });
  }),
).pipe(Layer.provide(AppConfigLive));

const ServedRoutesLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    return HttpRouter.serve(AppRoutes, {
      middleware: corsMiddleware(config.corsOrigins),
    });
  }),
).pipe(Layer.provide(AppConfigLive));

const HttpServerLive = ServedRoutesLive.pipe(
  Layer.provide(BunHttpServerLive),
  Layer.provide(LoggerLive),
);

BunRuntime.runMain(Layer.launch(HttpServerLive));
